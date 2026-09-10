/** Local composition gate for synthetic acceptance projects; no update/telemetry fetches. */
import { installOfflineServerGuard } from "../../vite.offline";
process.env.HYPERFRAMES_NO_TELEMETRY = "1";
process.env.HYPERFRAMES_NO_UPDATE_CHECK = "1";
process.env.HYPERFRAMES_NO_AUTO_INSTALL = "1";
installOfflineServerGuard();
await import("../../../cli/src/cli");
