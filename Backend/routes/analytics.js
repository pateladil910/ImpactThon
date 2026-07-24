const express = require("express");
const router = express.Router();
const Detection = require("../models/Detection");
const authMiddleware = require("../middleware/authMiddleware");

// Optional auth middleware — allows unauthenticated or expired token requests to gracefully fetch MongoDB history/analytics
const optionalAuthMiddleware = (req, res, next) => {
  let token = req.cookies ? req.cookies.token : null;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }
  if (token) {
    try {
      const jwt = require("jsonwebtoken");
      req.user = jwt.verify(token, "secretkey");
    } catch (e) {
      req.user = { id: null };
    }
  } else {
    req.user = { id: null };
  }
  next();
};

// GET / (maps to /api/history) — pulls all MongoDB detection history
router.get("/", optionalAuthMiddleware, async (req, res) => {
    try {
        const mongoose = require("mongoose");
        const userIdVal = req.user ? req.user.id : null;
        const userObjId = (userIdVal && mongoose.Types.ObjectId.isValid(userIdVal))
            ? new mongoose.Types.ObjectId(userIdVal)
            : null;

        const query = (userIdVal || userObjId) ? {
            $or: [
                ...(userIdVal ? [{ userId: userIdVal }] : []),
                ...(userObjId ? [{ userId: userObjId }] : []),
                { userId: null },
                { userId: { $exists: false } }
            ]
        } : {};

        const records = await Detection.find(query).sort({ timestamp: -1 }).limit(100).lean();
        
        // Map the fields for history.html
        const formatted = records.map(doc => {
            let tDate;
            if (doc.timestamp instanceof Date) {
                tDate = doc.timestamp;
            } else if (doc.timestamp) {
                tDate = new Date(doc.timestamp);
            } else if (doc.createdAt) {
                tDate = new Date(doc.createdAt);
            } else {
                tDate = new Date();
            }

            if (isNaN(tDate.getTime())) {
                tDate = new Date();
            }
            
            // Format to IST (GMT+5:30)
            const istDate = new Date(tDate.getTime() + (5.5 * 60 * 60 * 1000));
            
            // Format date to DD-MM-YYYY
            const day = String(istDate.getUTCDate()).padStart(2, '0');
            const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
            const year = istDate.getUTCFullYear();
            
            // Format time to HH:MM:SS
            const hours = String(istDate.getUTCHours()).padStart(2, '0');
            const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
            const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');

            let rawPhoto = doc.photo_base64 || doc.snapshotUrl || "";
            if (rawPhoto.startsWith("data:image/jpeg;base64,")) {
                rawPhoto = rawPhoto.replace("data:image/jpeg;base64,", "");
            }
            
            return {
                Event: doc.event || doc.message || "Machine proximity breach",
                Status: doc.status || "DANGER",
                Date: `${day}-${month}-${year}`,
                Time: `${hours}:${minutes}:${seconds}`,
                Photo: rawPhoto,
                EmailStatus: doc.email_status || "sent"
            };
        }).filter(Boolean);
        
        return res.status(200).json({ records: formatted, total: formatted.length });
    } catch (err) {
        console.error("Fetch History Error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch history" });
    }
});

// GET /api/analytics/data?type=day|month&date=YYYY-MM-DD|jan|feb... — scoped to logged-in user
router.get("/data", optionalAuthMiddleware, async (req, res) => {
    try {
        const mongoose = require("mongoose");
        const userIdVal = req.user ? req.user.id : null;
        const userObjId = (userIdVal && mongoose.Types.ObjectId.isValid(userIdVal))
            ? new mongoose.Types.ObjectId(userIdVal)
            : null;

        const userMatchList = (userIdVal || userObjId) ? [
            ...(userIdVal ? [{ userId: userIdVal }] : []),
            ...(userObjId ? [{ userId: userObjId }] : []),
            { userId: null },
            { userId: { $exists: false } }
        ] : [
            { status: { $exists: true } }
        ];

        const { type, date } = req.query;

        if (!type || !date) {
            return res.status(400).json({ success: false, message: "Missing type or date" });
        }

        let startDate, endDate;
        const offset = 5.5 * 60 * 60 * 1000;

        function parseDateQuery(dateStr) {
            if (!dateStr) return null;
            if (dateStr.includes("-")) {
                const parts = dateStr.split("-").map(Number);
                if (parts[0] > 1000) {
                    // YYYY-MM-DD
                    return { year: parts[0], month: parts[1] - 1, day: parts[2] };
                } else if (parts[2] > 1000) {
                    // DD-MM-YYYY
                    return { year: parts[2], month: parts[1] - 1, day: parts[0] };
                }
            }
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return null;
            return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
        }

        if (type === "day") {
            const parsed = parseDateQuery(date);
            if (!parsed) {
                return res.status(400).json({ success: false, message: "Invalid date format" });
            }

            const dayStartUTC = new Date(Date.UTC(parsed.year, parsed.month, parsed.day));
            startDate = new Date(dayStartUTC.getTime() - offset);
            endDate = new Date(startDate.getTime() + (24 * 60 * 60 * 1000) - 1);

            // Future Date Protection (relative to IST today)
            const now = new Date();
            const istNow = new Date(now.getTime() + offset);
            const todayEndIST = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + 1) - offset - 1);

            if (startDate.getTime() > todayEndIST.getTime()) {
                const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
                return res.json({ success: true, labels, data: new Array(24).fill(0) });
            }

            const rawDocs = await Detection.find({
                status: { $exists: true },
                $or: userMatchList
            }).select("timestamp createdAt status").lean();

            const hourlyData = new Array(24).fill(0);

            rawDocs.forEach(doc => {
                let tDate = doc.timestamp instanceof Date ? doc.timestamp : new Date(doc.timestamp || doc.createdAt || 0);
                if (isNaN(tDate.getTime())) return;
                
                if (tDate >= startDate && tDate <= endDate) {
                    const ist = new Date(tDate.getTime() + offset);
                    const hr = ist.getUTCHours();
                    if (hr >= 0 && hr < 24) {
                        hourlyData[hr]++;
                    }
                }
            });

            return res.json({ success: true, labels: Array.from({ length: 24 }, (_, i) => `${i}:00`), data: hourlyData });

        } else if (type === "month") {
            const monthMap = {
                jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
            };

            let monthIndex;
            let year = new Date().getFullYear();

            if (monthMap.hasOwnProperty(date.toLowerCase())) {
                monthIndex = monthMap[date.toLowerCase()];
            } else {
                const parts = date.split("-");
                if (parts.length === 2) {
                    year = parseInt(parts[0]);
                    monthIndex = parseInt(parts[1]) - 1;
                } else {
                    return res.status(400).json({ success: false, message: "Invalid date format for month" });
                }
            }

            const firstDayUTC = new Date(Date.UTC(year, monthIndex, 1));
            startDate = new Date(firstDayUTC.getTime() - offset);

            const nextMonthFirstDayUTC = new Date(Date.UTC(year, monthIndex + 1, 1));
            endDate = new Date(nextMonthFirstDayUTC.getTime() - offset - 1);

            const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

            const rawDocs = await Detection.find({
                status: { $exists: true },
                $or: userMatchList
            }).select("timestamp createdAt status").lean();

            const dailyData = new Array(daysInMonth).fill(0);

            rawDocs.forEach(doc => {
                let tDate = doc.timestamp instanceof Date ? doc.timestamp : new Date(doc.timestamp || doc.createdAt || 0);
                if (isNaN(tDate.getTime())) return;

                if (tDate >= startDate && tDate <= endDate) {
                    const ist = new Date(tDate.getTime() + offset);
                    const dayOfMonth = ist.getUTCDate();
                    if (dayOfMonth >= 1 && dayOfMonth <= daysInMonth) {
                        dailyData[dayOfMonth - 1]++;
                    }
                }
            });

            const labels = Array.from({ length: daysInMonth }, (_, i) => `Day ${i + 1}`);

            return res.json({ success: true, labels, data: dailyData });
        }

        res.status(400).json({ success: false, message: "Invalid filter type" });

    } catch (err) {
        console.error("Analytics Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

    // NEW ROUTE: Download Excel — scoped to logged-in user
    // Accepts token via Authorization header OR ?token= query param (needed for window.location.href downloads)
router.get("/download", optionalAuthMiddleware, async (req, res) => {
    try {
        const mongoose = require("mongoose");
        const userIdVal = req.user ? req.user.id : null;
        const userObjId = (userIdVal && mongoose.Types.ObjectId.isValid(userIdVal))
            ? new mongoose.Types.ObjectId(userIdVal) : null;

        const userMatchList = (userIdVal || userObjId) ? [
            ...(userIdVal ? [{ userId: userIdVal }] : []),
            ...(userObjId ? [{ userId: userObjId }] : []),
            { userId: null },
            { userId: { $exists: false } }
        ] : [
            { status: { $exists: true } }
        ];

        const detections = await Detection.find({
            status: { $exists: true },
            $or: userMatchList
        }).sort({ createdAt: -1 }).limit(500);

        let csv = "ID,Event,Status,EmailStatus,Timestamp\n";
        detections.forEach((d, idx) => {
            const ev = (d.breachType || "Human detected inside danger zone").replace(/"/g, '""');
            const st = d.status || "DANGER";
            const em = d.emailStatus || "--";
            const ts = d.timestamp ? new Date(d.timestamp).toLocaleString("en-IN") : new Date(d.createdAt).toLocaleString("en-IN");
            csv += `"${idx + 1}","${ev}","${st}","${em}","${ts}"\n`;
        });

        res.setHeader("Content-Type", "text/csv");
        res.attachment("detection_history_report.csv");
        return res.status(200).send(csv);
    } catch (err) {
        console.error("Download Error:", err);
        res.status(500).json({ success: false, message: "Download failed" });
    }
});

// POST /api/analytics/digest (compile and email daily/weekly reports to the authenticated user)
router.post("/digest", authMiddleware, async (req, res) => {
    try {
        const { timeframe } = req.body; // "daily" or "weekly"
        const userId = req.user.id;
        
        const User = require("../models/User");
        const userDoc = await User.findById(userId);
        if (!userDoc) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        const email = userDoc.email;
        const name = userDoc.name || "Operator";
        
        // Retrieve incidents in specified timeframe
        const days = timeframe === "weekly" ? 7 : 1;
        const timeLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        
        const Incident = require("../models/Incident");
        const incidents = await Incident.find({ userId: userId, createdAt: { $gte: timeLimit } }).sort({ createdAt: -1 });
        
        // Build beautiful SCADA-themed digest HTML
        let incidentRows = "";
        incidents.forEach((inc, idx) => {
            incidentRows += `
                <tr style="border-bottom: 1px solid #1e293b;">
                    <td style="padding: 10px; font-size: 13px;">${inc.createdAt.toLocaleString()}</td>
                    <td style="padding: 10px; font-size: 13px;">${inc.camera}</td>
                    <td style="padding: 10px; font-size: 13px; font-weight: bold; color: ${inc.severity === 'ALARM' ? '#ef4444' : '#f59e0b'};">${inc.breachType}</td>
                    <td style="padding: 10px; font-size: 13px;">${inc.confidence}%</td>
                    <td style="padding: 10px; font-size: 13px;">${inc.factory}</td>
                </tr>
            `;
        });
        
        if (incidents.length === 0) {
            incidentRows = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #94a3b8;">No proximity or PPE violations logged in this period. Great job!</td></tr>`;
        }
        
        const htmlContent = `
            <div style="font-family: sans-serif; background: #020617; color: #f8fafc; padding: 30px; border-radius: 12px; max-width: 700px; margin: auto; border: 1.5px solid rgba(6, 182, 212, 0.25);">
                <div style="border-bottom: 2px solid #06b6d4; padding-bottom: 15px; margin-bottom: 20px; text-align: center;">
                    <h1 style="color: #06b6d4; margin: 0; font-size: 24px; letter-spacing: 1px;">AI SMART SAFETY SHIELD</h1>
                    <p style="color: #94a3b8; font-size: 11px; margin: 5px 0 0 0; text-transform: uppercase;">Enterprise Industrial Digest Report</p>
                </div>
                
                <p style="font-size: 15px;">Hello <strong>${name}</strong>,</p>
                <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">Here is your scheduled safety evaluation digest compiling recorded machine hazard and PPE violation logs for the past <strong>${timeframe}</strong> period.</p>
                
                <div style="background: rgba(6, 182, 212, 0.05); border: 1px solid rgba(6, 182, 212, 0.15); border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <h3 style="color: #06b6d4; margin-top: 0; font-size: 14px;">Summary KPI Metrics:</h3>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #cbd5e1; line-height: 1.6;">
                        <li>Total Logged Violations: <strong style="color: #ef4444;">${incidents.length}</strong></li>
                        <li>Reporting Range: Last ${days} day(s)</li>
                        <li>Plant Monitor Status: <strong style="color: #10b981;">SECURED</strong></li>
                    </ul>
                </div>
                
                <h3 style="color: #06b6d4; font-size: 14px; border-bottom: 1px solid #1e293b; padding-bottom: 5px; margin-top: 25px;">Logged Violation Registry:</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px; text-align: left; color: #cbd5e1;">
                    <thead>
                        <tr style="border-bottom: 2px solid #1e293b; color: #94a3b8; font-size: 12px; text-transform: uppercase;">
                            <th style="padding: 10px;">Timestamp</th>
                            <th style="padding: 10px;">Camera</th>
                            <th style="padding: 10px;">Breach Type</th>
                            <th style="padding: 10px;">Confidence</th>
                            <th style="padding: 10px;">Factory</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${incidentRows}
                    </tbody>
                </table>
                
                <div style="margin-top: 30px; text-align: center; border-top: 1px solid #1e293b; padding-top: 20px; font-size: 11px; color: #94a3b8;">
                    This is an automated industrial safety digest dispatched by your Edge-Cloud platform.
                </div>
            </div>
        `;
        
        const { Resend } = require("resend");
        const resendInstance = new Resend(process.env.RESEND_API_KEY || "");
        
        await resendInstance.emails.send({
            from: 'AI Safety System <notifications@codevortex.in>',
            to: email,
            subject: `📊 Scheduled Safety Digest: ${timeframe.toUpperCase()}`,
            html: htmlContent
        });
        
        res.status(200).json({ success: true, message: `Digest compiled and dispatched successfully to ${email}.` });
    } catch(err) {
        console.error("Digest compilation error:", err);
        res.status(500).json({ success: false, message: "Digest compilation error: " + err.message });
    }
});

// POST /clear_history — clears only the logged-in user's logs
router.post("/clear_history", authMiddleware, async (req, res) => {
    try {
        const mongoose = require("mongoose");
        const userId = mongoose.Types.ObjectId.isValid(req.user.id)
            ? new mongoose.Types.ObjectId(req.user.id)
            : null;
        await Detection.deleteMany({ userId });
        console.log("💾 History cleared successfully from database");
        return res.status(200).json({ success: true, message: "History cleared successfully" });
    } catch (err) {
        console.error("Clear History Error:", err);
        return res.status(500).json({ success: false, message: "Failed to clear history" });
    }
});

// GET /api/analytics/count/today — today's danger count for persistent human count HUD
router.get("/count/today", optionalAuthMiddleware, async (req, res) => {
    try {
        const mongoose = require("mongoose");
        const userIdVal = req.user ? req.user.id : null;
        const userObjId = (userIdVal && mongoose.Types.ObjectId.isValid(userIdVal))
            ? new mongoose.Types.ObjectId(userIdVal) : null;

        // IST today boundaries
        const now = new Date();
        const offset = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(now.getTime() + offset);
        const startOfDayIST = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
        const startUTC = new Date(startOfDayIST.getTime() - offset);
        const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

        const matchQuery = {
            status: { $in: ["DANGER", "DANGER ZONE BREACH", "PROXIMITY"] },
            timestamp: { $gte: startUTC, $lte: endUTC }
        };

        if (userIdVal || userObjId) {
            matchQuery.$or = [
                ...(userIdVal ? [{ userId: userIdVal }] : []),
                ...(userObjId ? [{ userId: userObjId }] : []),
                { userId: null },
                { userId: { $exists: false } }
            ];
        }

        const count = await Detection.countDocuments(matchQuery);

        return res.status(200).json({ success: true, count });
    } catch (err) {
        console.error("Count Today Error:", err);
        return res.status(500).json({ success: false, count: 0 });
    }
});

// GET /api/analytics/ai-insights — AI analysis of detection patterns
router.get("/ai-insights", optionalAuthMiddleware, async (req, res) => {
    try {
        const mongoose = require("mongoose");
        const userIdVal = req.user ? req.user.id : null;
        const userObjId = (userIdVal && mongoose.Types.ObjectId.isValid(userIdVal))
            ? new mongoose.Types.ObjectId(userIdVal) : null;

        const userMatch = (userIdVal || userObjId) ? [
            ...(userIdVal ? [{ userId: userIdVal }] : []),
            ...(userObjId ? [{ userId: userObjId }] : []),
            { userId: null }, { userId: { $exists: false } }
        ] : [
            { status: { $exists: true } }
        ];

        // Last 30 days of data
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const records = await Detection.find({
            status: { $exists: true },
            timestamp: { $gte: thirtyDaysAgo },
            $or: userMatch
        }).lean();

        if (records.length === 0) {
            return res.json({
                success: true,
                insights: [],
                summary: "System active: No hazard breaches recorded in the last 30 days. Facility safety status is optimal."
            });
        }

        // Compute hourly distribution (IST)
        const offset = 5.5 * 60 * 60 * 1000;
        const hourBuckets = new Array(24).fill(0);
        const dayBuckets = { Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0, Sun:0 };
        const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

        records.forEach(r => {
            let tDate = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp || r.createdAt || Date.now());
            if (isNaN(tDate.getTime())) tDate = new Date();
            const ist = new Date(tDate.getTime() + offset);
            hourBuckets[ist.getUTCHours()]++;
            dayBuckets[dayNames[ist.getUTCDay()]]++;
        });

        const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
        const peakDay = Object.entries(dayBuckets).sort((a,b) => b[1]-a[1])[0];
        const safeHour = hourBuckets.indexOf(Math.min(...hourBuckets.filter(v => v > 0)));

        const todayStart = new Date(Date.now() - (Date.now() % (24*60*60*1000)));
        const yestStart  = new Date(todayStart.getTime() - 24*60*60*1000);
        const todayCount = records.filter(r => new Date(r.timestamp || r.createdAt || 0) >= todayStart).length;
        const yestCount  = records.filter(r => {
            const d = new Date(r.timestamp || r.createdAt || 0);
            return d >= yestStart && d < todayStart;
        }).length;
        const trend = todayCount > yestCount ? "📈 Higher than yesterday" : todayCount < yestCount ? "📉 Lower than yesterday" : "➡️ Same as yesterday";

        const insights = [
            {
                icon: "🕐",
                title: "Peak Danger Hour",
                value: `${peakHour}:00 – ${peakHour+1}:00`,
                detail: `Most intrusions (${hourBuckets[peakHour]}) happen at this hour. Consider extra supervision.`,
                severity: hourBuckets[peakHour] > 5 ? "high" : "medium"
            },
            {
                icon: "📅",
                title: "Highest Risk Day",
                value: peakDay[0],
                detail: `${peakDay[1]} intrusions recorded on ${peakDay[0]}s this month.`,
                severity: peakDay[1] > 10 ? "high" : "medium"
            },
            {
                icon: "📊",
                title: "Today vs Yesterday",
                value: trend,
                detail: `Today: ${todayCount} events. Yesterday: ${yestCount} events.`,
                severity: todayCount > yestCount ? "high" : "low"
            },
            {
                icon: "✅",
                title: "Safest Hour",
                value: safeHour >= 0 ? `${safeHour}:00 – ${safeHour+1}:00` : "All hours active",
                detail: "Fewest intrusions recorded at this time. Good window for maintenance.",
                severity: "low"
            },
            {
                icon: "🔢",
                title: "Total Events (30 Days)",
                value: `${records.length} intrusions`,
                detail: `Average ${(records.length / 30).toFixed(1)} per day over the last month.`,
                severity: records.length > 100 ? "high" : records.length > 30 ? "medium" : "low"
            }
        ];

        const summaryParts = [
            `⚠️ Peak risk at ${peakHour}:00.`,
            `📅 ${peakDay[0]} is your highest-risk day.`,
            `${trend}.`,
            `${records.length} total events in 30 days.`
        ];

        return res.json({ success: true, insights, summary: summaryParts.join(" "), totalEvents: records.length });
    } catch (err) {
        console.error("AI Insights Error:", err);
        return res.status(500).json({ success: false, insights: [], summary: "Unable to compute insights." });
    }
});

module.exports = router;
