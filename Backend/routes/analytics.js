const express = require("express");
const router = express.Router();
const Detection = require("../models/Detection");

// GET /api/analytics/data?type=day|month&date=YYYY-MM-DD|jan|feb...
router.get("/data", async (req, res) => {
    try {
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
                        status: "DANGER"
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
                        status: "DANGER"
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

    // NEW ROUTE: Download Excel
router.get("/download", async (req, res) => {
    try {
        const detections = await Detection.find({ status: "DANGER" }).sort({ timestamp: -1 });

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
module.exports = router;
