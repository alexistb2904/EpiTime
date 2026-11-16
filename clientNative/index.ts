import { registerRootComponent } from "expo";
import { registerWidgetTaskHandler } from "react-native-android-widget";

import App from "./App";
import { widgetTaskHandler } from "./src/widgets/widgetTaskHandler";

// Dev-only: EXPO_PUBLIC_WIDGET_PREVIEWS=1 mounts the widget preview capture screen instead of the app.
registerRootComponent(__DEV__ && process.env.EXPO_PUBLIC_WIDGET_PREVIEWS === "1" ? require("./src/dev/WidgetPreviews").default : App);
registerWidgetTaskHandler(widgetTaskHandler);
