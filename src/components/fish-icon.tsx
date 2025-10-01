import Image from 'next/image';

interface FishIconProps {
	typeId?: number;
	size?: number;
	className?: string;
}

/**
 * 魚のアイコンコンポーネント
 * type_idに対応する魚の画像を表示
 */
export default function FishIcon({ typeId, size = 64, className = '' }: FishIconProps) {
	// type_idから画像パスを決定
	// 利用可能な画像: 0.png, 2.png, 4.png, 5.png
	const getImagePath = (id?: number) => {
		if (id === undefined || id === null) {
			return '/0.png'; // デフォルトはマンボウ
		}

		// 利用可能な画像IDリスト
		const availableIds = [0, 2, 4, 5];

		// type_idが利用可能な画像に含まれているか確認
		if (availableIds.includes(id)) {
			return `/${id}.png`;
		}

		// 含まれていない場合はデフォルト
		return '/0.png';
	};

	return (
		<Image
			src={getImagePath(typeId)}
			alt="魚"
			width={size}
			height={size}
			className={className}
		/>
	);
}
