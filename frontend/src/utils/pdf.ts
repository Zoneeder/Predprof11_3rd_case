import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
// Убедитесь, что путь правильный: ../api/types
import type { Applicant, StatsRow } from "../api/types";

// Хелпер для загрузки шрифта
async function loadFont(doc: jsPDF, path: string, fontName: string) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error("Font not found");
    const blob = await res.blob();
    const reader = new FileReader();
    
    return new Promise<void>((resolve) => {
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Удаляем префикс data:font/ttf;base64, (если он есть) или берем как есть
        const data = base64.split(",")[1] || base64;
        
        doc.addFileToVFS(`${fontName}.ttf`, data);
        doc.addFont(`${fontName}.ttf`, fontName, "normal");
        doc.setFont(fontName);
        resolve();
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Не удалось загрузить шрифт, кириллица может не отображаться", e);
  }
}

interface GenerateOptions {
  stats: StatsRow[];
  applicants: Applicant[];
  chartElement: HTMLElement | null;
  date: string;
}

export async function generateReport({ stats, applicants, chartElement, date }: GenerateOptions) {
  const doc = new jsPDF();

  // 1. Подключаем русский шрифт
  // Убедитесь, что файл лежит в папке public/fonts/Roboto-Regular.ttf
  await loadFont(doc, "/fonts/Roboto-Regular.ttf", "Roboto");

  // 2. Заголовок
  doc.setFontSize(18);
  doc.text(`Отчет о ходе приемной кампании`, 14, 20);
  
  doc.setFontSize(12);
  doc.text(`Дата формирования: ${new Date().toLocaleString("ru-RU")}`, 14, 28);
  doc.text(`Актуально на дату: ${date}`, 14, 34);

  let currentY = 45;

  // 3. Таблица статистики
  doc.setFontSize(14);
  doc.text("Сводная статистика", 14, currentY);
  currentY += 5;

  const statsBody = stats.map((row) => {
    // Логика НЕДОБОР: если занято мест меньше, чем всего мест
    let passingScoreDisplay = row.passing_score.toString();
    
    if (row.places_filled < row.places_total) {
      passingScoreDisplay = "НЕДОБОР";
    }

    return [
      row.program_code, // ПМ, ИВТ...
      row.places_total,
      row.places_filled,
      passingScoreDisplay,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [["Программа", "Мест всего", "Занято", "Проходной балл"]],
    body: statsBody,
    styles: { font: "Roboto", fontSize: 10 },
    headStyles: { fillColor: [44, 62, 80] },
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 15;

  // 4. График
  if (chartElement) {
    doc.setFontSize(14);
    doc.text("Динамика проходных баллов", 14, currentY);
    currentY += 5;

    try {
      const canvas = await html2canvas(chartElement, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      
      const imgWidth = 180; 
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (currentY + imgHeight > 280) {
        doc.addPage();
        currentY = 20;
      }

      doc.addImage(imgData, "PNG", 14, currentY, imgWidth, imgHeight);
      currentY += imgHeight + 15;
    } catch (e) {
      console.error("Ошибка захвата графика", e);
    }
  }

  // 5. Списки зачисленных
  const admitted = applicants.filter(a => a.current_program);
  const programs = ["ПМ", "ИВТ", "ИТСС", "ИБ"]; 

  doc.addPage();
  currentY = 20;
  doc.setFontSize(16);
  doc.text("Списки рекомендованных к зачислению", 14, currentY);
  currentY += 10;

  for (const code of programs) {
    const list = admitted.filter(a => a.current_program === code);
    if (list.length === 0) continue;

    list.sort((a, b) => b.total_score - a.total_score);

    if (currentY > 250) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFontSize(12);
    doc.text(`Программа: ${code} (${list.length} чел.)`, 14, currentY);
    currentY += 5;

    const listBody = list.map(student => [
      student.id,
      student.full_name,
      student.total_score
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["ID", "ФИО", "Сумма баллов"]],
      body: listBody,
      styles: { font: "Roboto", fontSize: 9 },
      pageBreak: 'auto',
    });

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 10;
  }

  doc.save(`report_${date}.pdf`);
}