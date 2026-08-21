import { Route, Navigate, Routes } from "react-router";
import { ThemeModeProvider } from "~/client/theme/ThemeModeProvider";
import NavMenu from "~/client/components/layout/NavMenu";
import MainContainer from "~/client/components/layout/MainContainer";
import Footer from "~/client/components/layout/Footer";
import { NotificationProvider } from "~/client/components/notification/NotificationContext";
import { TargetsProvider } from "~/client/components/targets/TargetsContext";
import WakePage from "~/client/components/targets/WakePage";
import ConfigPage from "~/client/components/targets/ConfigPage";

function App() {
  return (
    <ThemeModeProvider>
      <NotificationProvider>
        <TargetsProvider>
          <NavMenu />
          <MainContainer>
            <Routes>
              <Route path="/" element={<WakePage />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </MainContainer>
          <Footer />
        </TargetsProvider>
      </NotificationProvider>
    </ThemeModeProvider>
  );
}

export default App;
