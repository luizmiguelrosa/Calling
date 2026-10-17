import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";

bootstrapApplication(AppComponent, appConfig)
  // The pre-bootstrap splash lives inside <app-root> in index.html; drop it once
  // the app has rendered so it cannot linger over the first view.
  .then(() => document.querySelector(".boot-splash")?.remove())
  .catch((err) => console.error(err));
