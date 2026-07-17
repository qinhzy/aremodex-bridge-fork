// FILE: HomeEmptyStateView.swift
// Purpose: Minimal splash screen with branding and live connection status.
// Layer: View
// Exports: HomeEmptyStateView
// Depends on: SwiftUI

import SwiftUI

struct HomeEmptyStateView<AuthSection: View, Footer: View>: View {
    let connectionPhase: CodexConnectionPhase
    let statusMessage: String?
    let securityLabel: String?
    let trustedPairPresentation: CodexTrustedPairPresentation?
    let offlinePrimaryButtonTitle: String
    let onPrimaryAction: () -> Void
    @ViewBuilder let authSection: () -> AuthSection
    @ViewBuilder let footer: () -> Footer

    @State private var dotPulse = false
    @State private var connectionAttemptStartedAt: Date?

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 20) {
                Image("AppLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 88, height: 88)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .adaptiveGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous))

                timedConnectionFeedback

                if let trustedPairPresentation {
                    TrustedPairSummaryView(presentation: trustedPairPresentation)
                } else if let securityLabel, !securityLabel.isEmpty {
                    Text(securityLabel)
                        .font(AppFont.caption())
                        .foregroundStyle(.secondary)
                }

                if let statusMessage, !statusMessage.isEmpty {
                    Text(statusMessage)
                        .font(AppFont.caption())
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                // Keeps reconnect or a fresh QR scan one tap away from the empty state.
                Button(action: onPrimaryAction) {
                    HStack(spacing: 10) {
                        if isBusy {
                            ProgressView()
                                .tint(.gray)
                                .scaleEffect(0.9)
                        }

                        Text(primaryButtonTitle)
                            .font(AppFont.body(weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 14)
                    .foregroundStyle(primaryButtonForeground)
                    .background(primaryButtonBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .padding(.top, 6)

                authSection()
            }
            .frame(maxWidth: 280)

            Spacer()

            footer()
                .frame(maxWidth: 280)
                .padding(.horizontal, 24)
                .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Remodex")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if connectionPhase == .connecting {
                connectionAttemptStartedAt = Date()
            }
            dotPulse = isBusy
        }
        .onChange(of: connectionPhase) { _, phase in
            connectionAttemptStartedAt = phase == .connecting ? Date() : nil
            dotPulse = isBusy
        }
    }

    // MARK: - Helpers

    private var isBusy: Bool {
        switch connectionPhase {
        case .connecting, .loadingChats, .syncing:
            return true
        case .offline, .connected:
            return false
        }
    }

    private var statusDotColor: Color {
        switch connectionPhase {
        case .connecting, .loadingChats, .syncing:
            return .orange
        case .connected:
            return .green
        case .offline:
            return Color(.tertiaryLabel)
        }
    }

    @ViewBuilder
    private var timedConnectionFeedback: some View {
        if case .connecting = connectionPhase {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                connectionFeedback(at: context.date)
            }
        } else {
            connectionFeedback(at: Date())
        }
    }

    private func connectionFeedback(at date: Date) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 6) {
                Circle()
                    .fill(statusDotColor)
                    .frame(width: 6, height: 6)
                    .scaleEffect(dotPulse ? 1.4 : 1.0)
                    .opacity(dotPulse ? 0.6 : 1.0)
                    .animation(
                        isBusy
                            ? .easeInOut(duration: 0.8).repeatForever(autoreverses: true)
                            : .default,
                        value: dotPulse
                    )

                Text(statusLabel(at: date))
                    .font(AppFont.caption(weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(Color(.systemBackground))
            )
            .overlay(
                Capsule()
                    .stroke(Color.primary.opacity(0.08), lineWidth: 1)
            )

            if isBusy {
                ConnectionPhaseProgressRail(phase: connectionPhase)
            }

            if isSlowConnection(at: date) {
                Text("This is taking longer than expected. Your Mac may be asleep or the saved pairing may have expired.")
                    .font(AppFont.caption())
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isSlowConnection(at: date))
    }

    private func statusLabel(at date: Date) -> String {
        switch connectionPhase {
        case .connecting:
            guard let connectionAttemptStartedAt else { return "Connecting" }
            let elapsed = date.timeIntervalSince(connectionAttemptStartedAt)
            if elapsed >= 12 { return "Still connecting…" }
            return "Connecting"
        case .loadingChats:
            return "Loading chats"
        case .syncing:
            return "Syncing"
        case .connected:
            return "Connected"
        case .offline:
            return "Offline"
        }
    }

    private func isSlowConnection(at date: Date) -> Bool {
        guard case .connecting = connectionPhase,
              let connectionAttemptStartedAt else {
            return false
        }
        return date.timeIntervalSince(connectionAttemptStartedAt) >= 12
    }

    private var primaryButtonTitle: String {
        switch connectionPhase {
        case .connecting:
            return "Reconnecting..."
        case .loadingChats:
            return "Loading chats..."
        case .syncing:
            return "Syncing..."
        case .connected:
            return "Disconnect"
        case .offline:
            return offlinePrimaryButtonTitle
        }
    }

    private var primaryButtonBackground: Color {
        isSocketReady ? Color(.secondarySystemFill) : Color.primary
    }

    private var primaryButtonForeground: Color {
        isSocketReady ? Color.primary : Color(.systemBackground)
    }

    private var isSocketReady: Bool {
        switch connectionPhase {
        case .loadingChats, .syncing, .connected:
            return true
        case .offline, .connecting:
            return false
        }
    }
}

private struct ConnectionPhaseProgressRail: View {
    let phase: CodexConnectionPhase

    private let labels = ["Relay", "Mac", "Workspace"]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                VStack(spacing: 5) {
                    HStack(spacing: 0) {
                        if index > 0 {
                            Rectangle()
                                .fill(index <= activeStep ? Color(.plan) : Color.primary.opacity(0.1))
                                .frame(height: 1)
                        }

                        Circle()
                            .fill(index <= activeStep ? Color(.plan) : Color(.tertiarySystemFill))
                            .frame(width: 7, height: 7)

                        if index < labels.count - 1 {
                            Rectangle()
                                .fill(index < activeStep ? Color(.plan) : Color.primary.opacity(0.1))
                                .frame(height: 1)
                        }
                    }

                    Text(label)
                        .font(AppFont.mono(.caption2))
                        .foregroundStyle(index <= activeStep ? .primary : .tertiary)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Connection progress")
        .accessibilityValue(labels[activeStep])
    }

    private var activeStep: Int {
        switch phase {
        case .connecting:
            return 0
        case .loadingChats:
            return 1
        case .syncing, .connected:
            return 2
        case .offline:
            return 0
        }
    }
}
