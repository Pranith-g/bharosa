import { Link } from "react-router-dom";
import { Logo } from "../components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <Logo />
      <h1 className="text-3xl font-extrabold">This page doesn't exist</h1>
      <p className="text-muted">If you were opening a private link, check it was copied in full.</p>
      <Link to="/" className="font-semibold text-brand">Go to the home page</Link>
    </div>
  );
}
