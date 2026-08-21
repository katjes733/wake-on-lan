import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { useTargets } from "~/client/components/targets/useTargets";
import TargetCard from "~/client/components/targets/TargetCard";

export default function WakePage() {
  const { targets, loading, error } = useTargets();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error" sx={{ textAlign: "center", pt: 4 }}>
        {error}
      </Typography>
    );
  }

  if (targets.length === 0) {
    return (
      <Box sx={{ textAlign: "center", pt: 4, px: 2 }}>
        <Typography variant="h6">No targets configured yet</Typography>
        <Typography variant="body2" color="text.secondary">
          Add one from the Targets page (menu in the top-left).
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 3,
        justifyContent: "center",
        mx: "auto",
        px: { xs: 2, sm: 0 },
        width: "100%",
        maxWidth: 1000,
      }}
    >
      {targets.map((target) => (
        <TargetCard key={target.id} target={target} />
      ))}
    </Box>
  );
}
