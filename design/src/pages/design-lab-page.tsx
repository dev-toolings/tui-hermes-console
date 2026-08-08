import { useState, type CSSProperties } from "react";
import { Moon, Sun, Zap } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { getDevicePreset, isDeviceId, type DeviceId } from "@hermes-console/device-kit";
import { isStage, type Stage } from "@hermes-console/guided-flow";
import { DeviceFrame } from "../components/device-frame";
import { DevicePicker } from "../components/device-picker";
import { IconButton } from "../components/ui/icon-button";
import { ZoomControl } from "../components/ui/zoom-control";
import { MockDeliveryRun, MockGuidedTask } from "../data";

export function DesignLabPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [zoom, setZoom] = useState(115);
  const [task, setTask] = useState(() => MockGuidedTask.create());
  const [run, setRun] = useState(() => MockDeliveryRun.create());

  if (!isDeviceId(params.deviceId) || !isStage(params.stage)) {
    return <Navigate to="/lab/iphone-15/request" replace />;
  }

  const deviceId = params.deviceId;
  const stage = params.stage;
  const device = getDevicePreset(deviceId);
  const previewStyle = { "--preview-frame-width": `${Math.round(device.width * zoom / 100)}px` } as CSSProperties;
  const navigateTo = (nextStage: Stage) => navigate(`/lab/${deviceId}/${nextStage}`);
  const selectDevice = (nextDevice: DeviceId) => navigate(`/lab/${nextDevice}/${stage}`);

  return (
    <div className="design-lab">
      <header className="lab-header">
        <div className="lab-brand"><span>H</span><div><strong>Hermes Console</strong><small>Mobile design lab</small></div></div>
        <div className="header-actions">
          <span className="prototype-chip"><span /> Prototype interactif</span>
          <IconButton label={dark ? "Passer au thème clair" : "Passer au thème sombre"} onClick={() => setDark(!dark)}>
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </IconButton>
        </div>
      </header>

      <main className="lab-layout">
        <aside className="device-panel">
          <div className="panel-intro">
            <span className="section-label">Aperçu adaptatif</span>
            <h1>Un parcours.<br />Cinq formats.</h1>
            <p>Le même contrat guidé se recompose du mobile compact au tri-fold, sans masquer les validations.</p>
          </div>

          <DevicePicker value={deviceId} onChange={selectDevice} />

          <div className="device-spec">
            <div><span>Appareil</span><strong>{device.name}</strong></div>
            <div><span>Écran source</span><strong>{device.screen}</strong></div>
            <div><span>Viewport simulé</span><strong>{device.viewport}</strong></div>
          </div>
        </aside>

        <section className="preview-area" style={previewStyle} aria-label={`Aperçu sur ${device.name}`}>
          <div className="ambient-mark mark-one" aria-hidden="true" />
          <div className="ambient-mark mark-two" aria-hidden="true" />
          <div className="preview-meta">
            <span>{device.family}</span>
            <ZoomControl value={zoom} onChange={setZoom} />
            <strong>{device.viewport}</strong>
          </div>
          <DeviceFrame
            device={device}
            dark={dark}
            stage={stage}
            navigateTo={navigateTo}
            zoom={zoom}
            task={task}
            run={run}
            onTaskChange={setTask}
            onRunChange={setRun}
          />
          <p className="interaction-hint"><Zap size={16} /> Utilisez les actions de la tâche pour parcourir le prototype.</p>
        </section>
      </main>
    </div>
  );
}
