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
    <div className="min-h-screen bg-off-white flex flex-col md:flex-row">
      {/* Left Side - Branding */}
      <div className="w-full md:w-5/12 bg-navy flex flex-col items-center justify-center gap-6 px-8 py-12 relative overflow-hidden">

        {/* Logo Ring */}
        <div className="w-18 h-18 rounded-full flex items-center justify-center relative z-10 box-shadow-lg overflow-hidden">
          <img src="https://cdn.builder.io/api/v1/image/assets%2F95235f61d85340cc8929dd5e2ec9cafe%2F04690f469f254fd393684ed5411b7cab?format=webp&width=800&height=1200" alt="ACDP Logo" className="w-full h-full object-cover" />
        </div>

        {/* Brand Box */}
        <div className="bg-white text-navy px-7 py-2.5 rounded-lg text-center relative z-10">
          <h1 className="font-rajdhani text-5xl font-bold letter-spacing-widest text-navy">
            ACDP
          </h1>
          <p className="font-barlow-cond text-xs letter-spacing-wider text-gray-600 mt-0.5">
            CONSUMER GOODS TRADING
          </p>
        </div>

        {/* Tagline */}
        <div className="text-center text-off-white relative z-10">
          <div className="font-rajdhani text-lg tracking-wider whitespace-nowrap">Cold Chain Connect</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/65">System</div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full md:flex-1 flex items-center justify-center px-6 py-8 md:py-12">
        <div className="bg-white rounded-2xl px-8 md:px-10 py-6 md:py-7 w-full max-w-sm md:max-w-md flex flex-col items-center gap-5 shadow-lg md:shadow-xl border border-border">
          <div className="text-center">
            <h2 className="font-rajdhani text-2xl font-semibold text-navy">Welcome Back</h2>
            <p className="mt-1 text-sm text-gray-500">Sign in to continue</p>
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
            <form className="w-full flex flex-col gap-3.5" onSubmit={handleSubmit}>
              {error && (
                <div className="w-full px-3.5 py-2.5 bg-red-50 border-2 border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Username Field */}
              <div>
                <label className="block text-xs font-semibold text-navy mb-1.5 letter-spacing-tight">
                  Username
                </label>
                <input
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3.5 py-2.5 border border-[#CBD5E1] rounded-lg text-sm text-navy bg-white transition-colors focus:outline-none focus:border-accent disabled:opacity-50"
                />
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-xs font-semibold text-navy mb-1.5 letter-spacing-tight">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-3.5 py-2.5 pr-11 border border-[#CBD5E1] rounded-lg text-sm text-navy bg-white transition-colors focus:outline-none focus:border-accent disabled:opacity-50"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-navy disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 bg-navy text-white rounded-xl font-rajdhani text-xl letter-spacing-widest font-semibold cursor-pointer transition-colors hover:bg-navy-mid mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Logging in..." : "Login"}
              </button>

              <div className="text-center text-xs text-gray-500">
                Forgot credentials? Contact Administrator
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
