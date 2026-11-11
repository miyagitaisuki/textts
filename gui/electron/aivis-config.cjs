// Nguồn tải AivisSpeech Engine và các giọng ghim sẵn (không đóng gói trong bộ cài).
// Khi cài, app còn lấy thêm TOÀN BỘ giọng công khai từ API AivisHub (xem fetchCatalog trong aivis-install.cjs).
// - engine: danh sách phần archive theo đúng thứ tự, mỗi phần có tên, URL và SHA-256 (đã kiểm tra).
// - models: danh sách file .aivmx tải trực tiếp, mỗi file có tên, URL và SHA-256 (đã kiểm tra, khớp checksum của AivisHub API).
// Khi thiếu một trong hai, nút tải trong app bị vô hiệu hóa.
// Bộ JVNV (jvnv-F1-jp, F2-jp, M1-jp, M2-jp) phát hành theo CC BY-SA 4.0: cần ghi nguồn khi chia sẻ âm thanh.
module.exports = {
  AIVIS_URL: process.env.AIVIS_URL || "http://127.0.0.1:10101",
  AIVIS_PORT: 10101,
  engine: {
    // AivisSpeech Engine 1.2.0, bản Windows-x64, một phần (manifest .7z.txt liệt kê đúng tên này).
    parts: [
      {
        name: "AivisSpeech-Engine-Windows-x64-1.2.0.7z.001",
        url: "https://github.com/Aivis-Project/AivisSpeech-Engine/releases/download/1.2.0/AivisSpeech-Engine-Windows-x64-1.2.0.7z.001",
        sha256: "bfbceba2e14dc7f23c7f3695f9ac0381baf91b15d6544e98384574eaadd271f3",
      },
    ],
  },
  models: {
    // Mỗi model tải từ AivisHub (api.aivis-project.com), SHA-256 khớp checksum của API.
    // Giấy phép ghi trong comment: JVNV là CC BY-SA 4.0, ACML 1.0 theo điều khoản của Aivis Project.
    files: [
      {
        name: "jvnv-F1-jp.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/6acf95e8-11a9-414e-aa9c-6dbebf9113ca/download?model_type=AIVMX",
        sha256: "d5e7f6e64c5b1395597e12f6a5e70e0befe3691cec29c659a60b08fbfa60c885",
      },
      {
        name: "jvnv-F2-jp.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/25b39db7-5757-47ef-9fe4-2b7aff328a18/download?model_type=AIVMX",
        sha256: "0a89c36cc3cd535703d6092022c6d6fab43251b9529c9d004ccc312070ca5aa2",
      },
      {
        name: "jvnv-M1-jp.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/d7255c2c-ddd0-425a-808c-662cd94c7f41/download?model_type=AIVMX",
        sha256: "6b53d8f44fab893c035146acec6b1653029cecbcaea0315cac9f27889f59261f",
      },
      {
        name: "jvnv-M2-jp.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/d1a7446f-230d-4077-afdf-923eddabe53c/download?model_type=AIVMX",
        sha256: "8ad58d2b85791f73bbc51216618100db5debfe574373ee28b71549b50bc50278",
      },
      // まお (ACML 1.0)
      {
        name: "a59cb814-0083-4369-8542-f51a29e72af7.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/a59cb814-0083-4369-8542-f51a29e72af7/download?model_type=AIVMX",
        sha256: "f87ccea2e8e2de0e0bfe52e803945af903b4086bf25621a015111628f00e4119",
      },
      // コハク (ACML 1.0)
      {
        name: "22e8ed77-94fe-4ef2-871f-a86f94e9a579.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/22e8ed77-94fe-4ef2-871f-a86f94e9a579/download?model_type=AIVMX",
        sha256: "3f5c08b52bb8a64efd361268580c81510f96c927cd6905aa7dbae6851333270a",
      },
      // 阿井田 茂 (ACML 1.0)
      {
        name: "47e53151-a378-46f3-abee-ce13aa07feb1.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/47e53151-a378-46f3-abee-ce13aa07feb1/download?model_type=AIVMX",
        sha256: "6dabe29de5ec2c1715e12a430805e1bff6ec64a315cccec2d26fad029df83243",
      },
      // にせ (ACML 1.0)
      {
        name: "6d11c6c2-f4a4-4435-887e-23dd60f8b8dd.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/6d11c6c2-f4a4-4435-887e-23dd60f8b8dd/download?model_type=AIVMX",
        sha256: "6ff7eaa61c24d37434e2c6ab672fc3ba189ecc9118c08918a486ed5316e5c9d3",
      },
      // まい (ACML 1.0)
      {
        name: "e9339137-2ae3-4d41-9394-fb757a7e61e6.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/e9339137-2ae3-4d41-9394-fb757a7e61e6/download?model_type=AIVMX",
        sha256: "eca53a500a70746f649572ec186d3b98665606b13e8e8e648f9b10fa8c0000c4",
      },
      // fumifumi (ACML 1.0)
      {
        name: "71e72188-2726-4739-9aa9-39567396fb2a.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/71e72188-2726-4739-9aa9-39567396fb2a/download?model_type=AIVMX",
        sha256: "dec42930f9fdd5948831a271fcc8b377f56001273c6d3035cf68465b6dbaf91a",
      },
      // morioki (ACML 1.0)
      {
        name: "baaae3c0-7b22-4605-8ba5-80c959b41a48.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/baaae3c0-7b22-4605-8ba5-80c959b41a48/download?model_type=AIVMX",
        sha256: "352858a737b23fe0bd0b7bd73a4956be262aad9bb24a7bf0d1eae9a71a466469",
      },
      // 花音 (ACML 1.0)
      {
        name: "a670e6b8-0852-45b2-8704-1bc9862f2fe6.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/a670e6b8-0852-45b2-8704-1bc9862f2fe6/download?model_type=AIVMX",
        sha256: "557984929a6a14ace0cfb1e2456a4c2f022653b55fe35cc8c2473e52723be394",
      },
      // 凛音エル (ACML 1.0)
      {
        name: "f5017410-fbb5-49e1-97cb-e785f42e15f5.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/f5017410-fbb5-49e1-97cb-e785f42e15f5/download?model_type=AIVMX",
        sha256: "e7ac9e2636f59d6f6512016d0752f9e9f89c2b3ffd2012a6a1b92791330e23bc",
      },
      // ろてじん（長老ボイス） (ACML 1.0)
      {
        name: "696c98a2-c0b7-4fe7-8cf2-c7e9b8a9bd82.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/696c98a2-c0b7-4fe7-8cf2-c7e9b8a9bd82/download?model_type=AIVMX",
        sha256: "9d23aa4901a9d6ace2ec35fa8933dbaaebdb76f8cfa7d60da0153864497d2bc2",
      },
      // るな (ACML 1.0)
      {
        name: "4f281e78-eba6-495a-8e50-5c322d02b5b1.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/4f281e78-eba6-495a-8e50-5c322d02b5b1/download?model_type=AIVMX",
        sha256: "d89da50ca3426bbc289608f7afd6912778c4f840e4fa4435cedf9d285c437cb8",
      },
      // みちのくあいり (ACML 1.0)
      {
        name: "1b2830f4-8cf1-4184-a0d9-3a1bace3a844.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/1b2830f4-8cf1-4184-a0d9-3a1bace3a844/download?model_type=AIVMX",
        sha256: "9f329209d12b048d1da9f37b6836d47d964014906531fa206118a7e15fca03c5",
      },
      // ほのか(~現実20代女子AIボイチェン~リアボVC公式モデル) (ACML 1.0)
      {
        name: "59f96896-64d2-4378-830a-4d5feb3d81aa.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/59f96896-64d2-4378-830a-4d5feb3d81aa/download?model_type=AIVMX",
        sha256: "9416a13da3a8551bba6e5a5311585f07fdce04660c1b5705bcae3e85c1a0552b",
      },
      // 中2 (ACML 1.0)
      {
        name: "9107b8b6-1ed1-43f5-bebe-0de4df4d229d.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/9107b8b6-1ed1-43f5-bebe-0de4df4d229d/download?model_type=AIVMX",
        sha256: "e4fd1c287f65e1ea32a81333b35ebc0db09435d186a97af4aa3d8aeea6351a40",
      },
      // 桜音 (ACML 1.0)
      {
        name: "3328da9a-8124-4619-a853-f7fc2f37889f.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/3328da9a-8124-4619-a853-f7fc2f37889f/download?model_type=AIVMX",
        sha256: "cac25db744778904c96f9373dc1105f66a3cf84596309811ca2874a0733552b3",
      },
      // らせつん (ACML 1.0)
      {
        name: "9f36ec0d-8dac-42dc-aff4-149c5f99faad.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/9f36ec0d-8dac-42dc-aff4-149c5f99faad/download?model_type=AIVMX",
        sha256: "86690635cf7e8511bf96e53c33049b0266a46b782e6edcfc40c8ad81fde7c75d",
      },
      // 猩々博士 (雑談ボイス) (ACML 1.0)
      {
        name: "70a875a9-feae-41e6-a586-8cf9e47c6c0b.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/70a875a9-feae-41e6-a586-8cf9e47c6c0b/download?model_type=AIVMX",
        sha256: "17b6317c08d372ce0b46cc383238a55b06dadcf97e05dff4c83484944d30e1b5",
      },
      // 澤原 玄二郎 (ACML 1.0)
      {
        name: "2e1fdde8-d089-42d7-b64f-cf89952b1bdc.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/2e1fdde8-d089-42d7-b64f-cf89952b1bdc/download?model_type=AIVMX",
        sha256: "a17a053af538d51ec6294473f2d30e85580a05154bee56e0d6788dcf118f8c1f",
      },
      // 観測症 (ACML 1.0)
      {
        name: "ed47c952-c253-405e-adba-1172399816a1.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/ed47c952-c253-405e-adba-1172399816a1/download?model_type=AIVMX",
        sha256: "73ae730ed9d714bc956e128a6ccaaf20e2944efd0b1bb474f1ba7e22de93dcd5",
      },
      // TANAKA (ACML 1.0)
      {
        name: "470a41e2-863f-4bf2-8a20-bf7cde0d8f7b.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/470a41e2-863f-4bf2-8a20-bf7cde0d8f7b/download?model_type=AIVMX",
        sha256: "703b0c1f9de7ac074524654aebb88f35c1b171fe642e9276c59921cbb5d218a4",
      },
    ],
  },
};
