import { Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import Landing from "./pages/Landing";
import Setup from "./pages/Setup";
import GuardianPage from "./pages/Guardian";
import ApprovePage from "./pages/Approve";
import SimulatorPage from "./pages/Simulator";
import DemoPage from "./pages/Demo";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/g" element={<GuardianPage />} />
        <Route path="/p" element={<SimulatorPage />} />
        <Route path="/a/:hh/:aid" element={<ApprovePage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ToastProvider>
  );
}
