const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const uploadDir = path.join("/tmp", "uploads");
const outputDir = path.join("/tmp", "outputs");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `input-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage: storage,

  limits: {
    fileSize: 100 * 1024 * 1024
  },

  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed."));
    }
  }
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "AI Shorts Maker Backend is running!"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online"
  });
});

app.post("/api/create-short", upload.single("video"), (req, res) => {

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No video uploaded."
    });
  }

  const inputFile = req.file.path;

  const outputFile = path.join(
    outputDir,
    `short-${Date.now()}.mp4`
  );

  const ffmpeg = spawn("ffmpeg", [
    "-y",

    "-i",
    inputFile,

    "-vf",
    "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "23",

    "-c:a",
    "aac",

    "-b:a",
    "128k",

    "-movflags",
    "+faststart",

    outputFile
  ]);

  let errorOutput = "";

  ffmpeg.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  ffmpeg.on("close", (code) => {

    try {
      fs.unlinkSync(inputFile);
    } catch (error) {}

    if (code !== 0) {

      console.error(errorOutput);

      return res.status(500).json({
        success: false,
        message: "Video processing failed.",
        error: errorOutput.slice(-1000)
      });
    }

    res.download(
      outputFile,
      "ai-short.mp4",
      (error) => {

        try {
          fs.unlinkSync(outputFile);
        } catch (cleanupError) {}

        if (error) {
          console.error(error);
        }
      }
    );
  });

  ffmpeg.on("error", (error) => {

    console.error(error);

    try {
      fs.unlinkSync(inputFile);
    } catch (cleanupError) {}

    res.status(500).json({
      success: false,
      message: "FFmpeg could not start.",
      error: error.message
    });
  });

});

app.use((error, req, res, next) => {

  if (error instanceof multer.MulterError) {

    return res.status(400).json({
      success: false,
      message: error.message
    });

  }

  res.status(400).json({
    success: false,
    message: error.message
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
