const functions = require("@google-cloud/functions-framework");
const axios = require("axios");
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

// envファイルからSlackトークンを取得
const slackToken = process.env.SLACK_TOKEN;

functions.http("main", (req, res) => {
  // チャレンジ認証
  if (req.body.type === "url_verification") {
    return res.status(200).send(req.body.challenge);
  }

  const event = req.body.event;
  console.log(event);

  if (event.subtype == "file_share") {
    handleShareEvent(event); // ファイル共有イベントを処理
  }
});

const handleShareEvent = async (event) => {
  // アクセストークンを発行する
  const newAcccessToken = await getAccessToken();

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const { client_id, client_secret, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);

  oAuth2Client.setCredentials({
    access_token: newAcccessToken,
    refresh_token: process.env.REFRESH_TOKEN,
  });

  // 保存先のフォルダID
  let folderId = "1rLgY6x1Nx-wqikTLbVmQVEl9qry0D2l-";

  for (const fileInfo of event.files) {
    const fileData = await getFileFromUrl(fileInfo.url_private);

    // Google Driveにファイルをアップロードする
    const fileId = await uploadFile(oAuth2Client, folderId, fileData, fileInfo);
  }
};

// URLからファイル情報をストリームで取得する関数
const getFileFromUrl = async (fileUrl) => {
  try {
    const response = await axios.get(fileUrl, {
      headers: {
        Authorization: `Bearer ${slackToken}`,
      },
      responseType: "stream", // ストリームデータとして取得
    });

    return response.data;
  } catch (error) {
    console.error("ファイル取得中にエラーが発生しました:", error);
  }
};

// アクセストークンの再発行を行う関数
const getAccessToken = async () => {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const { client_id, client_secret } = credentials.web;

  const refresh_token = process.env.REFRESH_TOKEN;
  const url = "https://oauth2.googleapis.com/token";

  const body = {
    client_id: client_id,
    client_secret: client_secret,
    grant_type: "refresh_token",
    refresh_token: refresh_token,
  };

  try {
    const response = await axios.post(url, body);

    return response.data.access_token;
  } catch (error) {
    console.error("Error:", error);
  }
};

// Google Driveにファイルをアップロードする関数
const uploadFile = async (oAuth2Client, folderId, fileData, fileInfo) => {
  const drive = google.drive({ version: "v3", auth: oAuth2Client });

  // アップロードするファイルのメタデータとコンテンツ
  const fileMetadata = {
    name: fileInfo.name, // Google Driveにアップロードされるファイル名
    parents: [folderId], // アップロード対象のディレクトリ
  };
  const media = {
    mimeType: fileInfo.mimetype,
    body: fileData,
  };

  try {
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id",
    });

    console.log("ファイルのアップロードに成功 File ID:", response.data.id);
    return response.data.id;
  } catch (error) {
    console.error("ファイルのアップロードに失敗:", error);
    return null;
  }
};
