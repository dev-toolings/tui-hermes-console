import { Navigate, Route, Routes } from "react-router-dom";
import { DesignLabPage } from "./pages/design-lab-page";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/lab/iphone-15/request" replace />} />
      <Route path="/lab/:deviceId/:stage" element={<DesignLabPage />} />
      <Route path="*" element={<Navigate to="/lab/iphone-15/request" replace />} />
    </Routes>
  );
}
