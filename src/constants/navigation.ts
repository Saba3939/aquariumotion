import { Home, User, Settings } from "lucide-react";

export const navigationItems = [
	{ id: "home", label: "ホーム", icon: Home },
	{ id: "profile", label: "プロフィール", icon: User },
	{ id: "device", label: "デバイス管理", icon: Settings },
] as const;