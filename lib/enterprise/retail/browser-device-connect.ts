"use client";

/** Browser-mediated pairing. Consent is requested by a user gesture; nothing
 * is sent to the DTSC server, and pairing never means a payment is captured.
 * Raw device protocols still require a certified adapter per supported model.
 */
export type RetailBrowserConnectionMode = "WEBUSB" | "WEBSERIAL" | "WEBBLUETOOTH";
export type RetailBrowserPairingResult = {
  ok: boolean;
  mode: RetailBrowserConnectionMode;
  name: string;
  message: string;
  scope: "BROWSER_PERMISSION";
};

type UsbHardware = { productName?: string; vendorId?: number; productId?: number };
type WebUsb = { requestDevice: (options: { filters: Array<Record<string, unknown>> }) => Promise<UsbHardware> };
type SerialHardware = { getInfo?: () => { usbVendorId?: number; usbProductId?: number } };
type WebSerial = { requestPort: () => Promise<SerialHardware> };
type BluetoothHardware = { name?: string };
type WebBluetooth = { requestDevice: (options: { acceptAllDevices: boolean }) => Promise<BluetoothHardware> };
type DeviceNavigator = Navigator & {
  usb?: WebUsb;
  serial?: WebSerial;
  bluetooth?: WebBluetooth;
};

export async function pairRetailBrowserDevice(mode: RetailBrowserConnectionMode): Promise<RetailBrowserPairingResult> {
  if (typeof window === "undefined" || !window.isSecureContext || typeof navigator === "undefined") {
    throw new Error("Une connexion HTTPS avec autorisation locale est nécessaire pour associer l'équipement.");
  }
  const device = navigator as DeviceNavigator;
  let name = "";
  if (mode === "WEBUSB") {
    if (!device.usb?.requestDevice) throw new Error("WebUSB n'est pas disponible dans ce navigateur.");
    const result = await device.usb.requestDevice({ filters: [] });
    name = result.productName || `USB ${result.vendorId ?? "?"}:${result.productId ?? "?"}`;
  } else if (mode === "WEBSERIAL") {
    if (!device.serial?.requestPort) throw new Error("WebSerial n'est pas disponible dans ce navigateur.");
    const result = await device.serial.requestPort();
    const info = result.getInfo?.();
    name = `Port série ${info?.usbVendorId ?? "?"}:${info?.usbProductId ?? "?"}`;
  } else {
    if (!device.bluetooth?.requestDevice) throw new Error("WebBluetooth n'est pas disponible dans ce navigateur.");
    const result = await device.bluetooth.requestDevice({ acceptAllDevices: true });
    name = result.name || "Périphérique Bluetooth";
  }
  return {
    ok: true,
    mode,
    name,
    message: "Autorisation du navigateur accordée. Le test du protocole matériel du modèle reste nécessaire avant utilisation opérationnelle.",
    scope: "BROWSER_PERMISSION",
  };
}
