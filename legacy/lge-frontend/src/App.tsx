import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Toaster } from "react-hot-toast";
import { CampaignsList } from "./pages/CampaignsList";
import { CampaignDetail } from "./pages/CampaignDetail";
import { UserProfile } from "./pages/UserProfile";
import { UserLaunches } from "./pages/UserLaunches";
import { About } from "./pages/About";

function App() {
  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "var(--background)",
            color: "var(--text)",
            border: "1px solid var(--primary)",
            maxWidth: "500px",
            wordBreak: "break-word",
            whiteSpace: "normal",
          },
          success: {
            iconTheme: {
              primary: "var(--primary)",
              secondary: "var(--background)",
            },
          },
          error: {
            iconTheme: {
              primary: "#ff6b6b",
              secondary: "var(--background)",
            },
          },
        }}
      />
      <Layout>
        <Routes>
          <Route path="/" element={<CampaignsList />} />
          <Route
            path="/campaign/:campaignAddress"
            element={<CampaignDetail />}
          />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/launches" element={<UserLaunches />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
