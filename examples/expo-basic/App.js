import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

const TEST_EMAIL = "qa@example.test";
const TEST_PASSWORD = "qa-agent-password";

const SAMPLE_CHECKS = [
  {
    id: "public",
    title: "Public screen",
    detail: "Public content is visible before login.",
  },
  {
    id: "auth",
    title: "Authenticated screen",
    detail: "Dogfood account can reach the private checklist.",
  },
  {
    id: "state",
    title: "List state",
    detail: "The app can switch from empty to populated content.",
  },
];

export default function App() {
  const [screen, setScreen] = useState("public");
  const [email, setEmail] = useState(TEST_EMAIL);
  const [password, setPassword] = useState(TEST_PASSWORD);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [showList, setShowList] = useState(false);
  const [bugMode, setBugMode] = useState(false);

  const activeScreen = screen === "private" && !isSignedIn ? "login" : screen;
  const visibleChecks = useMemo(
    () => (bugMode ? SAMPLE_CHECKS.slice(0, 2) : SAMPLE_CHECKS),
    [bugMode],
  );

  function signIn() {
    if (email.trim() === TEST_EMAIL && password === TEST_PASSWORD) {
      setIsSignedIn(true);
      setLoginError("");
      setScreen("private");
      return;
    }

    setLoginError("Invalid dogfood credentials.");
  }

  function signOut() {
    setIsSignedIn(false);
    setShowList(false);
    setBugMode(false);
    setScreen("public");
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Dogfood fixture</Text>
            <Text style={styles.title}>QA Agent Expo Basic</Text>
          </View>
          <Text testID="auth-state" style={styles.authState}>
            {isSignedIn ? "Signed in" : "Public"}
          </Text>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <TabButton
            label="Public"
            active={activeScreen === "public"}
            onPress={() => setScreen("public")}
            testID="tab-public"
          />
          <TabButton
            label="Private"
            active={activeScreen === "private" || activeScreen === "login"}
            onPress={() => setScreen("private")}
            testID="tab-private"
          />
          <TabButton
            label="Failure"
            active={activeScreen === "failure"}
            onPress={() => setScreen("failure")}
            testID="tab-failure"
          />
        </View>

        {activeScreen === "public" ? (
          <PublicScreen onOpenPrivate={() => setScreen("private")} />
        ) : activeScreen === "login" ? (
          <LoginScreen
            email={email}
            password={password}
            error={loginError}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={signIn}
          />
        ) : activeScreen === "private" ? (
          <PrivateScreen
            showList={showList}
            checks={visibleChecks}
            bugMode={bugMode}
            onShowEmpty={() => setShowList(false)}
            onShowList={() => setShowList(true)}
            onToggleBugMode={setBugMode}
            onSignOut={signOut}
          />
        ) : (
          <FailureScreen bugMode={bugMode} onToggleBugMode={setBugMode} />
        )}
      </View>
    </SafeAreaView>
  );
}

function PublicScreen({ onOpenPrivate }) {
  return (
    <View testID="public-screen" style={styles.panel}>
      <Text style={styles.sectionTitle}>Public smoke screen</Text>
      <Text style={styles.copy}>
        This screen is visible without authentication and gives QA Agent a stable
        first screenshot target.
      </Text>
      <PrimaryButton
        label="Open login-required screen"
        onPress={onOpenPrivate}
        testID="open-private"
      />
    </View>
  );
}

function LoginScreen({
  email,
  password,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}) {
  return (
    <View testID="login-screen" style={styles.panel}>
      <Text style={styles.sectionTitle}>Dogfood login</Text>
      <Text style={styles.copy}>
        Use deterministic credentials: qa@example.test and qa-agent-password.
      </Text>
      <TextInput
        testID="email-input"
        accessibilityLabel="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={onEmailChange}
        placeholder="Email"
        style={styles.input}
        value={email}
      />
      <TextInput
        testID="password-input"
        accessibilityLabel="Password"
        onChangeText={onPasswordChange}
        placeholder="Password"
        secureTextEntry
        style={styles.input}
        value={password}
      />
      {error ? (
        <Text testID="login-error" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton label="Sign in" onPress={onSubmit} testID="login-submit" />
    </View>
  );
}

function PrivateScreen({
  showList,
  checks,
  bugMode,
  onShowEmpty,
  onShowList,
  onToggleBugMode,
  onSignOut,
}) {
  return (
    <View testID="private-screen" style={styles.panel}>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Private checklist</Text>
        <Pressable testID="sign-out" onPress={onSignOut} style={styles.linkButton}>
          <Text style={styles.linkText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.stateButtons}>
        <SecondaryButton
          label="Empty state"
          active={!showList}
          onPress={onShowEmpty}
          testID="show-empty-state"
        />
        <SecondaryButton
          label="List state"
          active={showList}
          onPress={onShowList}
          testID="show-list-state"
        />
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.copy}>Controlled bug mode</Text>
        <Switch
          testID="bug-mode-switch"
          value={bugMode}
          onValueChange={onToggleBugMode}
        />
      </View>

      {showList ? (
        <FlatList
          testID="qa-check-list"
          data={checks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View testID={`qa-check-${item.id}`} style={styles.listItem}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listDetail}>{item.detail}</Text>
            </View>
          )}
          ListFooterComponent={
            bugMode ? (
              <Text testID="controlled-bug-message" style={styles.errorText}>
                Controlled failure: expected 3 checks but rendered 2.
              </Text>
            ) : null
          }
        />
      ) : (
        <View testID="empty-state" style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No QA checks queued</Text>
          <Text style={styles.copy}>
            This deterministic empty state lets QA Agent verify no-content UI.
          </Text>
        </View>
      )}
    </View>
  );
}

function FailureScreen({ bugMode, onToggleBugMode }) {
  return (
    <View testID="failure-screen" style={styles.panel}>
      <Text style={styles.sectionTitle}>Controlled failure mode</Text>
      <Text style={styles.copy}>
        Toggle this state when dogfooding report screenshots and failure
        classification.
      </Text>
      <View style={styles.rowBetween}>
        <Text style={styles.copy}>Expose known failure</Text>
        <Switch
          testID="failure-mode-switch"
          value={bugMode}
          onValueChange={onToggleBugMode}
        />
      </View>
      {bugMode ? (
        <View testID="known-failure-banner" style={styles.failureBanner}>
          <Text style={styles.failureText}>
            Known failure: checkout total is visually inconsistent.
          </Text>
        </View>
      ) : (
        <View testID="healthy-banner" style={styles.successBanner}>
          <Text style={styles.successText}>No controlled failure is active.</Text>
        </View>
      )}
    </View>
  );
}

function TabButton({ label, active, onPress, testID }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      testID={testID}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, testID }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.primaryButton}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, active, onPress, testID }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.secondaryButton, active && styles.secondaryButtonActive]}
    >
      <Text
        style={[
          styles.secondaryButtonText,
          active && styles.secondaryButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  shell: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    color: "#5b6472",
    fontSize: 13,
    fontWeight: "600",
  },
  title: {
    color: "#152033",
    fontSize: 26,
    fontWeight: "800",
  },
  authState: {
    color: "#152033",
    backgroundColor: "#e5ebf6",
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: "700",
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "#e7edf5",
  },
  tabActive: {
    backgroundColor: "#1d4ed8",
  },
  tabText: {
    color: "#334155",
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  panel: {
    flex: 1,
    gap: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6deea",
    backgroundColor: "#ffffff",
    padding: 18,
  },
  sectionTitle: {
    color: "#152033",
    fontSize: 21,
    fontWeight: "800",
  },
  copy: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 21,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 12,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "#166534",
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  secondaryButtonActive: {
    borderColor: "#1d4ed8",
    backgroundColor: "#eff6ff",
  },
  secondaryButtonText: {
    color: "#475569",
    fontWeight: "700",
  },
  secondaryButtonTextActive: {
    color: "#1d4ed8",
  },
  stateButtons: {
    flexDirection: "row",
    gap: 8,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  linkButton: {
    minHeight: 36,
    justifyContent: "center",
  },
  linkText: {
    color: "#1d4ed8",
    fontWeight: "800",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6deea",
    backgroundColor: "#f8fafc",
    padding: 20,
  },
  emptyTitle: {
    color: "#152033",
    fontSize: 18,
    fontWeight: "800",
  },
  listItem: {
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 12,
  },
  listTitle: {
    color: "#152033",
    fontSize: 16,
    fontWeight: "800",
  },
  listDetail: {
    color: "#475569",
    lineHeight: 20,
  },
  errorText: {
    color: "#b91c1c",
    fontWeight: "800",
  },
  failureBanner: {
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    padding: 14,
  },
  failureText: {
    color: "#991b1b",
    fontWeight: "800",
  },
  successBanner: {
    borderRadius: 8,
    backgroundColor: "#dcfce7",
    padding: 14,
  },
  successText: {
    color: "#166534",
    fontWeight: "800",
  },
});
