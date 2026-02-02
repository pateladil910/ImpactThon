const mongoose = require("mongoose");

// Connect DB
mongoose.connect("mongodb://127.0.0.1:27017/impactthon")
    .then(() => console.log("DB Connected"))
    .catch(err => console.error(err));

// Inline Schema to avoid path issues
const DetectionSchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: ["SAFE", "DANGER"],
            required: true
        },
        message: String
    },
    { timestamps: true }
);

const Detection = mongoose.model("Detection", DetectionSchema);

const seedData = async () => {
    try {
        await Detection.deleteMany({}); // Clear old data

        const today = new Date("2026-01-31T00:00:00");
        const detections = [];

        const createDate = (hour) => {
            const d = new Date(today);
            d.setHours(hour, 10, 0, 0); // 10 mins past the hour
            return d;
        };

        // 10:00 -> 5 Dangers
        for (let i = 0; i < 5; i++) detections.push({ status: "DANGER", createdAt: createDate(10), message: "Person fell" });

        // 14:00 -> 8 Dangers
        for (let i = 0; i < 8; i++) detections.push({ status: "DANGER", createdAt: createDate(14), message: "Violence detected" });

        // 20:00 -> 12 Dangers
        for (let i = 0; i < 12; i++) detections.push({ status: "DANGER", createdAt: createDate(20), message: "Weapon detected" });

        await Detection.insertMany(detections);
        console.log("✅ Data Seeded Successfully!");
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedData();
