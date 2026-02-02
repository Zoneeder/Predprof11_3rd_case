import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import type { Applicant, StatsRow } from "../api/types";

// Хелпер для загрузки шрифта
// Хелпер для загрузки шрифта
async function loadFont(doc: jsPDF, path: string, fontName: string) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Font not found at ${path}`);
    const blob = await res.blob();
    const reader = new FileReader();

    return new Promise<void>((resolve) => {
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const data = base64.split(",")[1] || base64;

        doc.addFileToVFS(`${fontName}.ttf`, data);
        
        doc.addFont(`${fontName}.ttf`, fontName, "normal");
  
        doc.addFont(`${fontName}.ttf`, fontName, "bold"); 

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
  // Файл должен лежать в public/fonts/Roboto-Regular.ttf
  await loadFont(doc, "/fonts/Roboto-Regular.ttf", "Roboto");

  // 2. Заголовок
  doc.setFontSize(18);
  doc.text(`Отчет о ходе приемной кампании`, 14, 20);

  doc.setFontSize(12);
  doc.text(`Дата формирования: ${new Date().toLocaleString("ru-RU")}`, 14, 28);
  doc.text(`Актуально на дату: ${date}`, 14, 34);

  let currentY = 45;

  // ---------------------------------------------------------
  // 3. Таблица общей статистики
  // ---------------------------------------------------------
  doc.setFontSize(14);
  doc.text("Сводная статистика", 14, currentY);
  currentY += 5;

  const statsBody = stats.map((row) => {
    let passingScoreDisplay = row.passing_score.toString();
    if (row.places_filled < row.places_total) {
      passingScoreDisplay = "НЕДОБОР";
    }

    return [
      row.program_code,
      row.places_total,
      row.places_filled,
      passingScoreDisplay,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [["Программа", "Мест всего", "Занято", "Проходной балл"]],
    body: statsBody,
    styles: { 
      font: "Roboto", // ВАЖНО: шрифт для тела таблицы
      fontSize: 10 
    },
    headStyles: { 
      fillColor: [44, 62, 80],
      font: "Roboto"  // ВАЖНО: шрифт для шапки
    },
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 15;

  // ---------------------------------------------------------
  // 4. График
  // ---------------------------------------------------------
  if (chartElement) {
    // Проверяем, влезет ли заголовок графика
    if (currentY + 10 > 280) { doc.addPage(); currentY = 20; }
    
    doc.setFontSize(14);
    doc.text("Динамика проходных баллов", 14, currentY);
    currentY += 5;

    try {
      const canvas = await html2canvas(chartElement, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");

      const imgWidth = 180;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Проверяем, влезет ли картинка
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

  // ---------------------------------------------------------
  // 5. Таблица детализации по приоритетам (ТЗ п.14.e)
  // ---------------------------------------------------------
  // Проверяем место на странице
  if (currentY + 60 > 280) { 
    doc.addPage(); 
    currentY = 20; 
  }

  doc.setFontSize(14);
  doc.text("Статистика по приоритетам", 14, currentY);
  currentY += 5;

  // Используем (r as any), так как типы могут быть еще не обновлены в types.ts
  const prioritiesBody = stats.map((r: any) => [
    r.program_code,
    r.count_priority_1 ?? 0, 
    r.count_priority_2 ?? 0, 
    r.count_priority_3 ?? 0, 
    r.count_priority_4 ?? 0,
    r.enrolled_priority_1 ?? 0, 
    r.enrolled_priority_2 ?? 0, 
    r.enrolled_priority_3 ?? 0, 
    r.enrolled_priority_4 ?? 0
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [
        ["ОП", "Заяв 1", "Заяв 2", "Заяв 3", "Заяв 4", "Зач 1", "Зач 2", "Зач 3", "Зач 4"]
    ],
    body: prioritiesBody,
    styles: { 
        font: "Roboto", 
        fontSize: 8, 
        halign: 'center' 
    },
    headStyles: { 
        fillColor: [44, 62, 80], 
        font: "Roboto" 
    },
    columnStyles: { 
        0: { fontStyle: 'bold', halign: 'left' } 
    }
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 15;

  // ---------------------------------------------------------
  // 6. Списки зачисленных
  // ---------------------------------------------------------
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

    // Сортировка по баллу
    list.sort((a, b) => b.total_score - a.total_score);

    // Если мало места для заголовка таблицы
    if (currentY > 260) {
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
      styles: { 
        font: "Roboto", // ВАЖНО
        fontSize: 9 
      },
      headStyles: { font: "Roboto" },
      pageBreak: 'auto',
    });

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 10;
  }

  doc.save(`report_${date}.pdf`);
}