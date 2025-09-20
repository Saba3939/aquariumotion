import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
	title: "AQUARIUMOTION",
	description: "あなたの水槽を管理しよう",
	icons: {
		icon: "/aquariumotion-icon.png",
		shortcut: "/aquariumotion-icon.png",
		apple: "/aquariumotion-icon.png",
	},
};;

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang='ja'>
			<body className='min-h-screen'>
				{children}
				<Toaster />
			</body>
		</html>
	);
}
