// Design notes per level (name and the challenge it brings), shown in the Check tab.
// Written by scripts/redesign/finalize.ts.
export interface LevelNote {
  name: string;
  challenge: string;
  redesigned: boolean;
}

export const LEVEL_NOTES: Record<number, LevelNote> = {
  "1": {
    "name": "Tutorial",
    "challenge": "6 box, 3 màu: học luật đường ra và slot",
    "redesigned": false
  },
  "2": {
    "name": "Kim cương đối xứng",
    "challenge": "Box hướng ra 4 phía, 7 màu, tập chọn màu theo đầu rồng",
    "redesigned": false
  },
  "3": {
    "name": "Khung Box10",
    "challenge": "Nhiều Box10 chiếm slot lâu; mở khóa booster Remove",
    "redesigned": false
  },
  "4": {
    "name": "Khối nhỏ hai cánh",
    "challenge": "Box ngang hai bên mở dần vào giữa",
    "redesigned": false
  },
  "5": {
    "name": "Khối lớn 7 màu",
    "challenge": "Khối rộng hơn, nhiều màu hơn, nhịp nhanh hơn",
    "redesigned": false
  },
  "6": {
    "name": "Khối đặc 49 box",
    "challenge": "Nhiều tầng box, kiểm tra kỹ năng trước khi có element; mở khóa Shuffle",
    "redesigned": false
  },
  "7": {
    "name": "Giới thiệu Tunnel",
    "challenge": "1 tunnel giữa khối nhỏ: lấy bus ở miệng để bus sau ra",
    "redesigned": false
  },
  "8": {
    "name": "Cổng vòm",
    "challenge": "Mở đường cho tunnel: 2 tunnel nằm dưới vòm, bus chỉ ra được khi dọn cột phía trên",
    "redesigned": true
  },
  "9": {
    "name": "Khung vuông rỗng",
    "challenge": "Khung 43 box quanh lỗ giữa, 4 màu; mở khóa Boost",
    "redesigned": false
  },
  "10": {
    "name": "Hành lang",
    "challenge": "Hard đầu tiên: tunnel trên bắn dọc hành lang có thanh chắn, tunnel bên bắn xuyên khối trái; rồng đòi màu nằm sâu",
    "redesigned": true
  },
  "11": {
    "name": "Chữ thập",
    "challenge": "Nghỉ sau level Hard: hình chữ thập mở ra 4 phía, 1 tunnel ở tâm bắn xuống nhánh dưới",
    "redesigned": true
  },
  "12": {
    "name": "Giới thiệu Conveyor",
    "challenge": "Băng chuyền chạy dưới khối box, chỉ lấy box trong vùng giữa",
    "redesigned": false
  },
  "13": {
    "name": "Mái che băng chuyền",
    "challenge": "Băng chuyền dưới mái: box trên băng chỉ đi lên được ở khe giữa hai khối, phải canh lúc box chạy qua khe",
    "redesigned": true
  },
  "14": {
    "name": "Hai đảo",
    "challenge": "Hai đảo đối mặt: box nằm ngang chĩa sang đảo kia, lấy ở đảo này để mở đường cho đảo kia",
    "redesigned": true
  },
  "15": {
    "name": "Củ hành + băng chuyền",
    "challenge": "Hard: vòng ngoài khóa lõi trong, rồng chia đoạn nhỏ, phải giữ slot cho màu lõi",
    "redesigned": true
  },
  "16": {
    "name": "Hoa văn 8 hướng",
    "challenge": "Box xoay 45°, đường ra chéo",
    "redesigned": false
  },
  "17": {
    "name": "Giới thiệu Frozen Box",
    "challenge": "Lưới Box6 hướng lên, hàng trên đóng băng: bắn box bên dưới vào để phá",
    "redesigned": false
  },
  "18": {
    "name": "Luyện phá băng",
    "challenge": "Khối nhỏ với 5 box băng ở hai bên",
    "redesigned": false
  },
  "19": {
    "name": "Bậc thang",
    "challenge": "Khối xếp bậc thang chéo, khe chéo cho box băng chuyền đi lên ở từng đoạn khác nhau",
    "redesigned": true
  },
  "20": {
    "name": "Đồng hồ cát băng",
    "challenge": "Hard: eo đồng hồ cát bị đóng băng, phải bắn đúng box vào băng để nối hai nửa",
    "redesigned": true
  },
  "21": {
    "name": "Chong chóng",
    "challenge": "Mở vòng lặp (level 21): 4 cánh chong chóng mở ra ngoài, tunnel ở tâm chờ cánh trên mở",
    "redesigned": true
  },
  "22": {
    "name": "Tunnel bị khóa",
    "challenge": "3 tunnel ở đáy, đường lên bị các cột box chặn, phải dọn đúng cột để tunnel nhả bus",
    "redesigned": true
  },
  "23": {
    "name": "Tường Box10",
    "challenge": "Hai bức tường Box10 kẹp lõi Box4: box lớn chiếm slot lâu, phải chọn thứ tự để không kẹt slot",
    "redesigned": true
  },
  "24": {
    "name": "Mũi tên",
    "challenge": "Mũi tên chỉ lên: thân giữa chặn đường băng chuyền, hai cánh mở dần từ ngoài vào",
    "redesigned": true
  },
  "25": {
    "name": "Hai tháp bắn chéo",
    "challenge": "Hard: tunnel tháp này bắn sang tháp kia, phải mở hàng đối diện trước, thêm băng chuyền và rồng vụn",
    "redesigned": true
  },
  "26": {
    "name": "Cầu băng",
    "challenge": "Hai đảo nối bằng cầu băng: phá băng trên cầu bằng box cùng hàng",
    "redesigned": true
  },
  "27": {
    "name": "Bẫy màu",
    "challenge": "Vòng ngoài toàn box rảnh nhưng màu nằm cuối rồng: lấy bừa là đầy slot, chỉ lấy box mở lối vào lõi",
    "redesigned": true
  },
  "28": {
    "name": "Củ hành 3 lớp",
    "challenge": "Ba lớp lồng nhau, lõi đóng băng: bóc từng lớp, giữ box để phá băng lõi",
    "redesigned": true
  },
  "29": {
    "name": "Bàn cờ",
    "challenge": "Ô bàn cờ xen dọc/ngang: mỗi ô chặn ô bên cạnh theo một hướng, băng chuyền đi qua các khe",
    "redesigned": true
  },
  "30": {
    "name": "Pháo đài",
    "challenge": "Hard: 2 tunnel trong sân bắn ra hai bên tường, góc tường đóng băng, rồng vụn 7 màu",
    "redesigned": true
  },
  "31": {
    "name": "Xoắn ốc",
    "challenge": "Dải box xoắn ốc vào tâm, tunnel ở tâm phải chờ 2 vòng phía trên mở; box đi ngang qua khe xoắn",
    "redesigned": true
  },
  "32": {
    "name": "Băng chuyền trên",
    "challenge": "Băng chuyền ở trên, khối bên dưới hướng xuống và ngang",
    "redesigned": false
  },
  "33": {
    "name": "Dây chuyền băng",
    "challenge": "Băng nằm sâu trong cột: phải mở cột trước, rồi mới có box bắn trúng băng",
    "redesigned": true
  },
  "34": {
    "name": "Kim tự tháp",
    "challenge": "Tháp bậc ngang: đỉnh tháp là màu cuối rồng, phải mở từ hai bên sườn",
    "redesigned": true
  },
  "35": {
    "name": "Hai băng chuyền",
    "challenge": "Hard: băng trên luôn lấy được, băng dưới bị khối giữa che; rồng vụn, phải chia slot giữa hai băng",
    "redesigned": true
  },
  "36": {
    "name": "Kim cương 45°",
    "challenge": "Khối kim cương xoay chéo, đường ra theo đường chéo",
    "redesigned": false
  },
  "37": {
    "name": "Chong chóng băng",
    "challenge": "Chong chóng quay ngược, đầu cánh đóng băng: phá băng từ trong ra",
    "redesigned": true
  },
  "38": {
    "name": "Ngã tư tunnel",
    "challenge": "4 tunnel ở tâm bắn ra 4 hướng, mỗi hướng bị một khối chặn: chọn hướng nào mở trước",
    "redesigned": true
  },
  "39": {
    "name": "Hai tháp song song",
    "challenge": "Hai cột tháp nhiều Box10, nghỉ trước level cuối",
    "redesigned": false
  },
  "40": {
    "name": "Lâu đài",
    "challenge": "Hard cuối vòng: tường băng, 2 tunnel bắn ra tường, băng chuyền dưới chân, rồng vụn 8 màu",
    "redesigned": true
  }
};
