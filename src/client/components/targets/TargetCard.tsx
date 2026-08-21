import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import { useState } from "react";
import { useTargets } from "~/client/components/targets/useTargets";
import type { ApiTarget } from "~/client/api/targetsApi";

export default function TargetCard({ target }: { target: ApiTarget }) {
  const { wake } = useTargets();
  const [waking, setWaking] = useState(false);

  const handleWake = async () => {
    setWaking(true);
    try {
      await wake(target.id);
    } finally {
      setWaking(false);
    }
  };

  return (
    <Card
      elevation={3}
      sx={{
        minWidth: { xs: "100%", sm: 280 },
        maxWidth: 400,
        flex: 1,
        borderRadius: 2,
      }}
    >
      <CardContent>
        <Typography variant="h6" fontWeight={600} noWrap>
          {target.name}
        </Typography>
        {target.staticIp && (
          <Typography variant="body2" color="text.secondary">
            {target.staticIp}
          </Typography>
        )}
        {target.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {target.notes}
          </Typography>
        )}
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          startIcon={
            waking ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <PowerSettingsNewIcon />
            )
          }
          onClick={handleWake}
          disabled={waking}
          fullWidth
        >
          Wake
        </Button>
      </CardActions>
    </Card>
  );
}
