import { type CSSProperties } from "react";
import { type DevicePreset } from "@hermes-console/device-kit";
import { type Stage } from "@hermes-console/guided-flow";
import { ProductScreen } from "./guided-task/product-screen";
import { type MockDeliveryRun, type MockGuidedTask } from "../data";

type DeviceFrameProps = {
  device: DevicePreset;
  dark: boolean;
  stage: Stage;
  navigateTo: (stage: Stage) => void;
  zoom: number;
  task: MockGuidedTask;
  run: MockDeliveryRun;
  onTaskChange: (task: MockGuidedTask) => void;
  onRunChange: (run: MockDeliveryRun) => void;
};

export function DeviceFrame({ device, dark, stage, navigateTo, zoom, task, run, onTaskChange, onRunChange }: DeviceFrameProps) {
  const scale = zoom / 100;
  const style = {
    "--device-width": `${device.width}px`,
    "--device-height": `${device.height}px`,
    "--device-ratio": `${device.width} / ${device.height}`,
    "--device-scale": scale,
    "--device-scaled-width": `${Math.round(device.width * scale)}px`,
    "--device-scaled-height": `${Math.round(device.height * scale)}px`,
  } as CSSProperties;

  return (
    <div className="device-scale-shell" style={style}>
      <div className={`device-frame ${device.platform} folds-${device.folds}`}>
        <div className="device-buttons" aria-hidden="true"><span /><span /><span /></div>
        <div className="device-screen">
          {device.platform === "ios" ? <div className="dynamic-island" aria-hidden="true" /> : <div className="camera-hole" aria-hidden="true" />}
          {device.folds > 0 && <div className="fold-lines" aria-hidden="true">{Array.from({ length: device.folds }).map((_, index) => <span key={index} />)}</div>}
          <ProductScreen device={device} dark={dark} stage={stage} navigateTo={navigateTo} task={task} run={run} onTaskChange={onTaskChange} onRunChange={onRunChange} />
        </div>
      </div>
    </div>
  );
}
