const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: String,
  email: {
    type: String,
    unique: true
  },
  password: String,
  role: {
    type: String,
    enum: ["admin", "operator", "viewer"],
    default: "viewer"
  },
  cameraUrl: {
    type: String,
    default: ""
  },
  cameraUser: {
    type: String,
    default: ""
  },
  cameraPass: {
    type: String,
    default: ""
  }
});

module.exports = mongoose.model("User", UserSchema);
