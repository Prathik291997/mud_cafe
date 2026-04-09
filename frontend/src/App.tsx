import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { ManagerLoginPage } from "./pages/ManagerLoginPage";
import { ManagerDashboardPage } from "./pages/ManagerDashboardPage";
import { TablePage } from "./pages/TablePage";

const CustomerScanPage = lazy(async () => {
  const m = await import("./pages/CustomerScanPage");
  return { default: m.CustomerScanPage };
});

function ScanFallback() {
  return (
    <div className="page center">
      <p className="muted">Opening camera…</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/customer"
          element={
            <Suspense fallback={<ScanFallback />}>
              <CustomerScanPage />
            </Suspense>
          }
        />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/manager/login" element={<ManagerLoginPage />} />
        <Route path="/manager" element={<ManagerDashboardPage />} />
        <Route path="/t/:token" element={<TablePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
