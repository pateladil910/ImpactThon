const express = require("express");
const router = express.Router();
const Detection = require("../models/Detection");
const authMiddleware = require("../middleware/authMiddleware");
// GET / (maps to /api/history) — scoped to the logged-in user
router.get("/", authMiddleware, async (req, res) => {
    try {
        const mongoose = require("mongoose");
        const userId = mongoose.Types.ObjectId.isValid(req.user.id)
            ? new mongoose.Types.ObjectId(req.user.id)
            : null;

        const records = await Detection.find({ userId }).sort({ timestamp: -1 }).lean();
        
        // Map the fields for history.html
        const formatted = records.map(doc => {
            const timestamp = doc.timestamp;
            if (!timestamp) return null;
            
            // Format to IST (GMT+5:30)
            const istDate = new Date(timestamp.getTime() + (5.5 * 60 * 60 * 1000));
            
            // Format date to DD-MM-YYYY
            const day = String(istDate.getUTCDate()).padStart(2, '0');
            const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
            const year = istDate.getUTCFullYear();
            
            // Format time to HH:MM:SS
            const hours = String(istDate.getUTCHours()).padStart(2, '0');
            const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
            const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
            
            return {
                Event: doc.event || "Machine proximity breach",
                Status: doc.status || "DANGER",
                Date: `${day}-${month}-${year}`,
                Time: `${hours}:${minutes}:${seconds}`,
                Photo: doc.photo_base64 || "",
                EmailStatus: doc.email_status || "not_triggered"
            };
        }).filter(Boolean);
        
        return res.status(200).json(formatted);
    } catch (err) {
        console.error("Fetch History Error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch history" });
    }
});

// GET /api/analytics/data?type=day|month&date=YYYY-MM-DD|jan|feb... — scoped to logged-in user
router.get("/data", authMiddleware, async (req, res) => {
    try {
        const mongoose = require("mongoose");
        const userId = mongoose.Types.ObjectId.isValid(req.user.id)
            ? new mongoose.Types.ObjectId(req.user.id)
            : null;

        const { type, date } = req.query;

        if (!type || !date) {
            return res.status(400).json({ success: false, message: "Missing type or date" });
        }

        let queryDate;
        let startDate, endDate;

        if (type === "day") {
            // Date format: YYYY-MM-DD
            // Correctly handle IST Timezone (+05:30)
            // Construct start/end times in UTC but aligned to IST day boundaries
            // Date string "YYYY-MM-DD" -> IST Midnight is target

            const offset = 5.5 * 60 * 60 * 1000; // +5:30 in ms

            // Start of day in IST (presuming 'date' is YYYY-MM-DD)
            // We want 00:00:00 IST on that day.
            // new Date(date) creates UTC midnight. 
            // 00:00 UTC is 05:30 IST. 
            // We want 00:00 IST, which is 18:30 UTC previous day.
            // So we take UTC Midnight and subtract 5 hours 30 mins.

            const utcMidnight = new Date(date);
            startDate = new Date(utcMidnight.getTime() - offset);
            endDate = new Date(startDate.getTime() + (24 * 60 * 60 * 1000) - 1);

            // Aggregate by HOUR (0-23) in IST
            const data = await Detection.aggregate([
                {
                    $match: {
                        timestamp: { $gte: startDate, $lte: endDate },
                        status: "DANGER",
                        userId: userId
                    }
                },
                {
                    $group: {
                        _id: { $hour: { date: "$timestamp", timezone: "+05:30" } },
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Fill in missing hours
            const hourlyData = new Array(24).fill(0);
            data.forEach(item => {
                hourlyData[item._id] = item.count;
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

            // Month boundary: 1st of Month 00:00 IST
            // Date(year, monthIndex, 1) is local system time. If server is UTC, it's UTC. 
            // Safer to work with UTC offsets for consistency.

            // Create UTC midnight of 1st day
            const firstDayUTC = new Date(Date.UTC(year, monthIndex, 1));
            // Shift to IST start (-5:30)
            startDate = new Date(firstDayUTC.getTime() - offset);

            // Create UTC midnight of 1st day of next month
            const nextMonthFirstDayUTC = new Date(Date.UTC(year, monthIndex + 1, 1));
            // Shift to IST start (-5:30) -> This is end of current month
            endDate = new Date(nextMonthFirstDayUTC.getTime() - offset - 1);

            // Aggregate by HOUR (0-23) for the entire MONTH in IST
            const data = await Detection.aggregate([
                {
                    $match: {
                        timestamp: { $gte: startDate, $lte: endDate },
                        status: "DANGER",
                        userId: userId
                    }
                },
                {
                    $group: {
                        _id: { $hour: { date: "$timestamp", timezone: "+05:30" } },
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Fill in missing hours (0-23)
            const hourlyData = new Array(24).fill(0);
            data.forEach(item => {
                if (item._id >= 0 && item._id < 24) {
                    hourlyData[item._id] = item.count;
                }
            });

            const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);

            return res.json({ success: true, labels, data: hourlyData });
        }

        res.status(400).json({ success: false, message: "Invalid filter type" });

    } catch (err) {
        console.error("Analytics Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

    // NEW ROUTE: Download Excel — scoped to logged-in user
    // Accepts token via Authorization header OR ?token= query param (needed for window.location.href downloads)
router.get("/download", async (req, res) => {
    try {
        const jwt = require("jsonwebtoken");
        // Try Authorization header first, then fall back to ?token query param
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        } else if (req.query.token) {
            token = req.query.token;
        }
        if (!token) return res.status(401).json({ msg: "No token, authorization denied" });

        let decoded;
        try { decoded = jwt.verify(token, "secretkey"); }
        catch (e) { return res.status(401).json({ msg: "Token is not valid" }); }

        const mongoose = require("mongoose");
        const userId = mongoose.Types.ObjectId.isValid(decoded.id)
            ? new mongoose.Types.ObjectId(decoded.id)
            : null;
        const detections = await Detection.find({ status: "DANGER", userId }).sort({ timestamp: -1 });

        // If you don't have an excel library installed yet, you can send a CSV for now
        let csv = "ID,Date,Time,Status\n";
        detections.forEach((d) => {
            csv += `${d._id},${d.timestamp.toLocaleDateString()},${d.timestamp.toLocaleTimeString()},${d.status}\n`;
        });

        res.setHeader("Content-Type", "text/csv");
        res.attachment("history_report.csv");
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
        const resendInstance = new Resend('re_5Y834Z7x_UAwoJVHEWhyJPJjxWKcnUtGr');
        
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

module.exports = router;
