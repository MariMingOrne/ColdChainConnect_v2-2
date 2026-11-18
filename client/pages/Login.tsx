import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { MfaChallengeResponse, MfaSetupResponse } from "@shared/api";
import { MfaStep } from "../components/auth/MfaStep";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [challenge, setChallenge] = useState<MfaChallengeResponse | null>(null);
  const [setupInfo, setSetupInfo] = useState<MfaSetupResponse | null>(null);
  const login = useAuth((state) => state.login);
  const setupMfa = useAuth((state) => state.setupMfa);
  const verifyMfa = useAuth((state) => state.verifyMfa);
  const navigate = useNavigate();

  const resetToCredentials = () => {
    setChallenge(null);
    setSetupInfo(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Username and password are required");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const next = await login({ username, password });
      if (!next) {
        navigate("/");
        return;
      }
      if (next.mfa === "setup") {
        setSetupInfo(await setupMfa(next.challenge_token));
      }
      setChallenge(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/^Sign-in expired\./i.test(message)) {
        setError("Your sign-in expired. Please enter your credentials again.");
      } else if (message === "Invalid credentials") {
        setError("Invalid username or password");
      } else if (message === "Internal server error" || message === "Login failed") {
        setError("Sign-in is temporarily unavailable. Please try again later.");
      } else {
        setError(message || "Login failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (code: string) => {
    if (!challenge) return;

    setError("");
    setIsLoading(true);

    try {
      const user = await verifyMfa({ challenge_token: challenge.challenge_token, code });
      const destination = user.role === "agent"
        ? "/booking-dispatch/order-summary"
        : user.role === "driver"
          ? "/driver-schedule"
          : "/";
      navigate(destination, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      if (/^Sign-in expired\./i.test(message)) {
        setChallenge(null);
        setSetupInfo(null);
        setError("Your sign-in expired. Please enter your credentials again.");
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Left Side - Branding */}
      <div className="w-full md:w-5/12 bg-navy flex flex-col items-center justify-center gap-6 px-8 py-12 relative overflow-hidden">

        {/* Logo Ring */}
        <div className="w-18 h-18 rounded-full flex items-center justify-center relative z-10 box-shadow-lg overflow-hidden">
          <img src="https://cdn.builder.io/api/v1/image/assets%2F95235f61d85340cc8929dd5e2ec9cafe%2F04690f469f254fd393684ed5411b7cab?format=webp&width=800&height=1200" alt="ACDP Logo" className="w-full h-full object-cover" />
        </div>

        {/* Brand Box */}
        <div className="bg-card text-foreground px-7 py-2.5 rounded-lg text-center relative z-10">
          <h1 className="font-rajdhani text-5xl font-bold letter-spacing-widest text-foreground">
            ACDP
          </h1>
          <p className="font-barlow-cond text-xs letter-spacing-wider text-muted-foreground mt-0.5">
            CONSUMER GOODS TRADING
          </p>
        </div>

        {/* Tagline */}
        <div className="text-center text-chrome-foreground relative z-10">
          <div className="font-rajdhani text-lg tracking-wider whitespace-nowrap">Cold Chain Connect</div>
          
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full md:flex-1 flex items-center justify-center px-6 py-8 md:py-12">
        <div className="bg-card rounded-2xl px-8 md:px-10 py-6 md:py-7 w-full max-w-sm md:max-w-md flex flex-col items-center gap-5 shadow-lg md:shadow-xl border border-border">
          <div className="text-center">
            <h2 className="font-rajdhani text-2xl font-semibold text-foreground">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
          </div>

          {challenge ? (
            <MfaStep
              mode={challenge.mfa}
              setupInfo={setupInfo}
              error={error}
              isLoading={isLoading}
              onSubmit={handleMfaSubmit}
              onBack={resetToCredentials}
            />
          ) : (
            <form className="flex w-full flex-col gap-4" onSubmit={handleSubmit} noValidate={false}>
              {error && (
                <div role="alert" className="w-full rounded-lg border border-destructive/30 bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="login-username">Username</Label>
                <Input
                  id="login-username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  aria-invalid={Boolean(error) || undefined}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    aria-invalid={Boolean(error) || undefined}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={isLoading}
                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <Button type="submit" size="lg" disabled={isLoading} className="mt-1 w-full">
                {isLoading ? "Signing in…" : "Sign in"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">Forgot your password? Ask an administrator to reset it.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
