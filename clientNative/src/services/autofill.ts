import { NativeModules, Platform } from "react-native";

const AutofillModule = NativeModules.EpiTimeAutofill as
	| {
			commit?: () => Promise<boolean>;
			cancel?: () => Promise<boolean>;
	  }
	| undefined;

export async function commitAutofillContext() {
	if (Platform.OS !== "android" || !AutofillModule?.commit) return false;
	return AutofillModule.commit().catch(() => false);
}

export async function cancelAutofillContext() {
	if (Platform.OS !== "android" || !AutofillModule?.cancel) return false;
	return AutofillModule.cancel().catch(() => false);
}
