-- AUTH-03 MFA policy rollout: defaults remain disabled until explicit governance action.
ALTER TABLE "AppSetting" ADD COLUMN "requireMfaForAllUsers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSetting" ADD COLUMN "requireMfaForDtscInternal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AuthMfaChallenge" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'VERIFY';
