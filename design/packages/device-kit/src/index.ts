export type DeviceId = "iphone-15" | "iphone-15-pro-max" | "pixel-9" | "fold-7" | "tri-fold";

export type DevicePreset = {
  id: DeviceId;
  shortName: string;
  name: string;
  family: string;
  screen: string;
  viewport: string;
  width: number;
  height: number;
  platform: "ios" | "android";
  folds: 0 | 1 | 2;
};

export const devicePresets: DevicePreset[] = [
  { id: "iphone-15", shortName: "iPhone 15", name: "Apple iPhone 15", family: "Compact", screen: "6,1 pouces · 2556 × 1179", viewport: "393 × 852 CSS px", width: 393, height: 852, platform: "ios", folds: 0 },
  { id: "iphone-15-pro-max", shortName: "15 Pro Max", name: "Apple iPhone 15 Pro Max", family: "Grand mobile", screen: "6,7 pouces · 2796 × 1290", viewport: "430 × 932 CSS px", width: 430, height: 932, platform: "ios", folds: 0 },
  { id: "pixel-9", shortName: "Android", name: "Google Pixel 9", family: "Android standard", screen: "6,3 pouces · 2424 × 1080", viewport: "412 × 915 CSS px", width: 412, height: 915, platform: "android", folds: 0 },
  { id: "fold-7", shortName: "Fold", name: "Samsung Galaxy Z Fold7", family: "Fold ouvert", screen: "8 pouces · 2184 × 1968", viewport: "672 × 744 CSS px", width: 672, height: 744, platform: "android", folds: 1 },
  { id: "tri-fold", shortName: "Ultra fold", name: "Samsung Galaxy Z TriFold", family: "Tri-fold ouvert", screen: "10 pouces · 2160 × 1584", viewport: "860 × 631 CSS px", width: 860, height: 631, platform: "android", folds: 2 },
];

export function isDeviceId(value: string | undefined): value is DeviceId {
  return devicePresets.some((device) => device.id === value);
}

export function getDevicePreset(id: DeviceId): DevicePreset {
  return devicePresets.find((device) => device.id === id) ?? devicePresets[0];
}
