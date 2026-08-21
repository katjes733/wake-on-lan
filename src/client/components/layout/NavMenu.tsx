import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import AppsIcon from "@mui/icons-material/Apps";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useCallback, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { useThemeMode } from "~/client/theme/useThemeMode";

interface NavItem {
  path: string;
  label: string;
}

// One array drives both the page title lookup and the nav menu, so they
// can't drift apart — same convention as tesla-powerwall-automation's
// NavMenu, just without the permission-based filtering (no auth in v1).
const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Wake" },
  { path: "/config", label: "Targets" },
];

const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.path, item.label]),
);

export default function NavMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { mode, toggle } = useThemeMode();
  const pageTitle = PAGE_TITLES[location.pathname] ?? "";
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [mainMenuAnchor, setMainMenuAnchor] = useState<null | HTMLElement>(
    null,
  );

  const handleMainMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMainMenuAnchor(event.currentTarget);
  };

  const handleMainMenuClose = () => {
    setMainMenuAnchor(null);
  };

  const handleNavigate = useCallback(
    (path: string) => {
      handleMainMenuClose();
      navigate(path);
    },
    [navigate],
  );

  return (
    <AppBar
      position="fixed"
      color="primary"
      enableColorOnDark
      sx={{
        width: "100%",
        bgcolor: "background.paper",
        color: "text.primary",
        boxShadow: 1,
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 48, sm: 64 }, px: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexShrink: 1,
            flexGrow: 0,
          }}
        >
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            onClick={handleMainMenuOpen}
            sx={{ mr: 1 }}
          >
            <AppsIcon />
          </IconButton>
          <Menu
            anchorEl={mainMenuAnchor}
            open={Boolean(mainMenuAnchor)}
            onClose={handleMainMenuClose}
          >
            {NAV_ITEMS.map((item) => (
              <MenuItem
                key={item.path}
                onClick={() => handleNavigate(item.path)}
              >
                {item.label}
              </MenuItem>
            ))}
          </Menu>
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexDirection: "row",
            flexGrow: 1,
            minWidth: 0,
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {isMobile ? (
            <Typography variant="h6" component="div" fontWeight={600} noWrap>
              {pageTitle}
            </Typography>
          ) : (
            <Typography variant="h5" component="div" fontWeight={600} noWrap>
              Wake-on-LAN Manager
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <IconButton
            color="inherit"
            onClick={toggle}
            aria-label={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
          >
            {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
