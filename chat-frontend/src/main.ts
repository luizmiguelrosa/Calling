import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";

// Tauri replaces WebView2's drag-drop handler unless `dragDropEnabled` is false
// in `tauri.conf.json`, and that replacement is what stops the composer from
// ever seeing an HTML5 drag event. With the handler disabled the events arrive,
// but so does WebView2's default reaction to a dropped file — navigating to it —
// so the default is suppressed window-wide. The composer's own handler still
// runs and stages the files; this only stops a drop elsewhere from leaving the
// app.
const suppressFileDrop = (event: DragEvent) => {
  if (event.dataTransfer?.types.includes("Files")) {
    event.preventDefault();
  }
};

document.addEventListener("dragover", suppressFileDrop);
document.addEventListener("drop", suppressFileDrop);

bootstrapApplication(AppComponent, appConfig)
  // The pre-bootstrap splash lives inside <app-root> in index.html; drop it once
  // the app has rendered so it cannot linger over the first view.
  .then(() => document.querySelector(".boot-splash")?.remove())
  .catch((err) => console.error(err));
