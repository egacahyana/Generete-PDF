import { useState } from "react";
import {
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import "nativewind"; // registers Tailwind classes

// ==== UPDATE THIS LINE AFTER DEPLOY ==== 
const API_URL = "https://YOUR-PROJECT-NAME.vercel.app/api/generate-pdf";
// ======================================

export default function App() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const generatePDF = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("Validasi", "Judul dan isi tidak boleh kosong.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Server error: ${txt}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      // Determine safe filename from header
      const disposition = response.headers.get("Content-Disposition");
      let filename = "document.pdf";
      if (disposition && disposition.includes("filename=")) {
        filename = disposition
          .split("filename=")[1]
          .replace(/["';]/g, "")
          .trim();
      }

      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/pdf",
          dialogTitle: "Bagikan PDF",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Tidak dapat berbagi", `File disimpan di ${fileUri}`);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100 p-4">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <Text className="text-2xl font-bold text-center mb-4">Simple PDF Generator</Text>
        <Text className="mb-1 font-medium">Judul PDF</Text>
        <TextInput
          className="border rounded p-2 mb-4 bg-white"
          placeholder="Contoh: Laporan"
          value={title}
          onChangeText={setTitle}
          editable={!loading}
        />
        <Text className="mb-1 font-medium">Isi Teks</Text>
        <TextInput
          className="border rounded p-2 h-40 bg-white text-left"
          placeholder="Tuliskan teks di sini..."
          value={content}
          onChangeText={setContent}
          multiline
          editable={!loading}
        />
        <TouchableOpacity
          className={`mt-6 py-3 px-4 rounded ${loading ? "bg-gray-400" : "bg-blue-600"}`}
          onPress={generatePDF}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-center text-white font-medium">Buat PDF</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
