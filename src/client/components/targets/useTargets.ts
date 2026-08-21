import { useContext } from "react";
import { TargetsContext } from "./targetsContextValue";

export const useTargets = () => useContext(TargetsContext);
