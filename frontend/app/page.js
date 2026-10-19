import RiskApp from "./RiskApp";

// Read at request time, so the same Docker image works locally and online.
export const dynamic = "force-dynamic";

export default function Page() {
  const api = process.env.API_URL || "http://localhost:8000";
  return <RiskApp api={api} />;
}
