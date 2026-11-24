import { useCallback, useEffect, useState } from "react";
import { GuardianApp } from "../components/guardian/GuardianApp";
import { KeyGate } from "../components/ui";
import { useRoleKey } from "../lib/keys";

export default function GuardianPage() {
  const [key, setKey] = useRoleKey("guardian");
  const [err, setErr] = useState("");
  useEffect(() => { document.title = "Bharosa · Guardian"; }, []);
  const onUnauthorized = useCallback(() => { setKey(""); setErr("That link didn't work. It may be old or mistyped."); }, [setKey]);
  if (!key) return <KeyGate role="guardian" error={err} onKey={(k) => { setErr(""); setKey(k); }} />;
  return (
    <div className="h-dvh">
      <GuardianApp apiKey={key} onUnauthorized={onUnauthorized} onForget={() => setKey("")} />
    </div>
  );
}
