import * as Notifications from "expo-notifications";
import Relais from "./Relais";

// Affiche les notifs même quand l'app est au premier plan (réveil de l'étincelle).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// L'app EST le jeu RELAIS.
export default function App() {
  return <Relais />;
}
