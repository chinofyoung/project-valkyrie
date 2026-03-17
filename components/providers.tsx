"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);

const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorBackground: "#1A1A2A",
    colorPrimary: "#C8FC03",
    colorText: "#FFFFFF",
    colorTextOnPrimaryBackground: "#0A0A0A",
    colorTextSecondary: "#9CA3AF",
    colorInputBackground: "#222236",
    colorInputText: "#FFFFFF",
    colorNeutral: "#FFFFFF",
    colorDanger: "#EF4444",
    colorSuccess: "#22C55E",
    borderRadius: "8px",
  },
  elements: {
    card: {
      backgroundColor: "#1A1A2A",
      border: "1px solid rgba(255,255,255,0.05)",
      boxShadow: "none",
    },
    headerTitle: { color: "#FFFFFF" },
    headerSubtitle: { color: "#9CA3AF" },
    socialButtonsBlockButton: {
      backgroundColor: "#222236",
      border: "1px solid rgba(255,255,255,0.05)",
      color: "#FFFFFF",
    },
    socialButtonsBlockButtonText: { color: "#FFFFFF" },
    formFieldLabel: { color: "#9CA3AF" },
    formFieldInput: {
      backgroundColor: "#222236",
      border: "1px solid rgba(255,255,255,0.05)",
      color: "#FFFFFF",
    },
    formButtonPrimary: {
      backgroundColor: "#C8FC03",
      color: "#0A0A0A",
      fontWeight: 600,
    },
    footerActionLink: { color: "#C8FC03" },
    footerActionText: { color: "#9CA3AF" },
    identityPreview: {
      backgroundColor: "#222236",
      border: "1px solid rgba(255,255,255,0.05)",
    },
    identityPreviewText: { color: "#FFFFFF" },
    identityPreviewEditButton: { color: "#C8FC03" },
    formFieldAction: { color: "#C8FC03" },
    formFieldSuccessText: { color: "#22C55E" },
    formFieldErrorText: { color: "#EF4444" },
    formFieldWarningText: { color: "#EF4444" },
    alert: { color: "#FFFFFF" },
    alertText: { color: "#FFFFFF" },
    dividerLine: { backgroundColor: "rgba(255,255,255,0.05)" },
    dividerText: { color: "#9CA3AF" },
    otpCodeFieldInput: {
      backgroundColor: "#222236",
      border: "1px solid rgba(255,255,255,0.05)",
      color: "#FFFFFF",
    },
    avatarBox: { width: "2.75rem", height: "2.75rem" },
    userButtonPopoverCard: {
      backgroundColor: "#1A1A2A",
      border: "1px solid rgba(255,255,255,0.05)",
    },
    userButtonPopoverActionButton: { color: "#FFFFFF" },
    userButtonPopoverActionButtonText: { color: "#FFFFFF" },
    userButtonPopoverActionButtonIcon: { color: "#9CA3AF" },
    userButtonPopoverFooter: { display: "none" },
    userPreviewMainIdentifier: { color: "#FFFFFF" },
    userPreviewSecondaryIdentifier: { color: "#9CA3AF" },
    modalContent: { backgroundColor: "#1A1A2A" },
    modalCloseButton: { color: "#9CA3AF" },
    navbar: { backgroundColor: "#1A1A2A" },
    navbarButton: { color: "#FFFFFF" },
    navbarButtonIcon: { color: "#9CA3AF" },
    pageScrollBox: { backgroundColor: "#1A1A2A" },
    profileSection: { borderColor: "rgba(255,255,255,0.05)" },
    profileSectionTitle: { color: "#FFFFFF", borderColor: "rgba(255,255,255,0.05)" },
    profileSectionTitleText: { color: "#FFFFFF" },
    profileSectionContent: { color: "#FFFFFF" },
    profileSectionPrimaryButton: { color: "#C8FC03" },
    accordionTriggerButton: { color: "#FFFFFF" },
    accordionContent: { color: "#9CA3AF" },
    badge: { color: "#FFFFFF", backgroundColor: "#222236" },
    tagInputContainer: { backgroundColor: "#222236" },
    menuButton: { color: "#FFFFFF" },
    menuList: { backgroundColor: "#1A1A2A" },
    menuItem: { color: "#FFFFFF" },
  },
};

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
