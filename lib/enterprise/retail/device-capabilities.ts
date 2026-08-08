export type RetailBrowserDeviceCapabilities = {
  print: boolean;
  webUsb: boolean;
  webBluetooth: boolean;
  webSerial: boolean;
  browserInput: boolean;
};

export type RetailDeviceProfileSummary = {
  deviceType: string;
  connectionMode: string;
  status: string;
};

export type RetailDeviceAvailability = {
  available: boolean;
  degraded: boolean;
  reason: "AVAILABLE" | "MANUAL_FALLBACK" | "EXTERNAL_BRIDGE" | "BROWSER_API_UNAVAILABLE" | "DISABLED";
};

export function detectRetailBrowserDeviceCapabilities(): RetailBrowserDeviceCapabilities {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { print: false, webUsb: false, webBluetooth: false, webSerial: false, browserInput: false };
  }
  const extendedNavigator = navigator as Navigator & { usb?: unknown; bluetooth?: unknown; serial?: unknown };
  return {
    print: typeof window.print === "function",
    webUsb: Boolean(extendedNavigator.usb),
    webBluetooth: Boolean(extendedNavigator.bluetooth),
    webSerial: Boolean(extendedNavigator.serial),
    browserInput: true,
  };
}

export function evaluateRetailDeviceAvailability(profile: RetailDeviceProfileSummary, capabilities: RetailBrowserDeviceCapabilities): RetailDeviceAvailability {
  if (profile.status !== "ACTIVE") return { available: false, degraded: false, reason: "DISABLED" };
  switch (profile.connectionMode) {
    case "MANUAL":
      return { available: true, degraded: true, reason: "MANUAL_FALLBACK" };
    case "NETWORK":
    case "NATIVE_BRIDGE":
      return { available: true, degraded: false, reason: "EXTERNAL_BRIDGE" };
    case "WEBUSB":
      return capabilities.webUsb ? { available: true, degraded: false, reason: "AVAILABLE" } : { available: false, degraded: true, reason: "BROWSER_API_UNAVAILABLE" };
    case "WEBBLUETOOTH":
      return capabilities.webBluetooth ? { available: true, degraded: false, reason: "AVAILABLE" } : { available: false, degraded: true, reason: "BROWSER_API_UNAVAILABLE" };
    case "WEBSERIAL":
      return capabilities.webSerial ? { available: true, degraded: false, reason: "AVAILABLE" } : { available: false, degraded: true, reason: "BROWSER_API_UNAVAILABLE" };
    case "BROWSER":
      if (profile.deviceType === "RECEIPT_PRINTER") {
        return capabilities.print ? { available: true, degraded: false, reason: "AVAILABLE" } : { available: false, degraded: true, reason: "BROWSER_API_UNAVAILABLE" };
      }
      return capabilities.browserInput ? { available: true, degraded: false, reason: "AVAILABLE" } : { available: false, degraded: true, reason: "BROWSER_API_UNAVAILABLE" };
    default:
      return { available: false, degraded: true, reason: "BROWSER_API_UNAVAILABLE" };
  }
}
