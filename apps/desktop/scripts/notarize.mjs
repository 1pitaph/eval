import path from "node:path";
import { notarize } from "@electron/notarize";

export default async function notarizeMac(context) {
  if (process.platform !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const isReleaseBuild = process.env.EVAL_DESKTOP_RELEASE === "1";

  if (!appleId || !appleIdPassword || !teamId) {
    const message =
      "[notarize] Missing APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID.";
    if (isReleaseBuild) {
      throw new Error(`${message} Release desktop builds must be notarized.`);
    }
    console.warn(`${message} Skipping notarization for this unsigned/local build.`);
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  await notarize({
    appBundleId: "com.evalstudio.desktop",
    appPath: path.join(context.appOutDir, `${appName}.app`),
    appleId,
    appleIdPassword,
    teamId
  });
}
