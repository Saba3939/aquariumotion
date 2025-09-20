import { Home, Trophy, User, Settings } from "lucide-react";

export const navigationItems = [
	{ id: "home", label: "ホーム", icon: Home },
	{ id: "ranking", label: "ランキング", icon: Trophy },
	{ id: "profile", label: "プロフィール", icon: User },
	{ id: "device", label: "デバイス管理", icon: Settings },
] as const;