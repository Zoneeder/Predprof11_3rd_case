import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import type { Applicant, StatsRow } from "../api/types";

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
  intersections?: import("../api/types").IntersectionStats;
  chartElement: HTMLElement | null;
  date: string;
}

export async function generateReport({ stats, applicants, intersections, chartElement, date }: GenerateOptions) {
  const doc = new jsPDF();

  // 1. Подключаем русский шрифт
  await loadFont(doc, "/fonts/Roboto-Regular.ttf", "Roboto");

  // 2. Заголовок
  doc.setFontSize(18);
  doc.text(`Отчет о ходе приемной кампании`, 14, 20);

  doc.setFontSize(12);
  doc.text(`Дата формирования: ${new Date().toLocaleString("ru-RU")}`, 14, 28);
  doc.text(`Актуально на дату: ${date}`, 14, 34);

  let currentY = 45;

  // 4. График
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

  // 5. Таблица статистики
  // Проверяем место на странице
  if (currentY + 60 > 280) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(14);
  doc.text("Статистика по программам", 14, currentY);
  currentY += 5;

  // Данные для таблицы
  const getStat = (code: string) => stats.find(s => s.program_code === code);

  const pm = getStat("ПМ");
  const ivt = getStat("ИВТ");
  const itss = getStat("ИТСС");
  const ib = getStat("ИБ");

  const totalUnique = applicants.length;

  const bodyData = [
    [
      { content: "Общее кол-во заявлений", colSpan: 1, styles: { fontStyle: 'bold' as const } },
      { content: totalUnique.toString(), colSpan: 4, styles: { halign: 'center' as const } }
    ],
    [
      { content: "Количество мест на ОП", styles: { fontStyle: 'bold' as const } },
      pm?.places_total ?? "-",
      ivt?.places_total ?? "-",
      itss?.places_total ?? "-",
      ib?.places_total ?? "-"
    ],
    [
      { content: "Кол-во заявлений 1-го приоритета", styles: { fontStyle: 'bold' as const } },
      pm?.count_priority_1 ?? "-",
      ivt?.count_priority_1 ?? "-",
      itss?.count_priority_1 ?? "-",
      ib?.count_priority_1 ?? "-"
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [
      ["Показатель", "ПМ", "ИВТ", "ИТСС", "ИБ"]
    ],
    body: bodyData,
    styles: {
      font: "Roboto",
      fontSize: 10,
      halign: 'center'
    },
    headStyles: {
      fillColor: [44, 62, 80],
      font: "Roboto"
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 80 }
    }
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 15;

  const passingScoresBody = [
    ["Проходной балл"],
    [
      (pm?.places_filled ?? 0) < (pm?.places_total ?? 0) ? "НЕДОБОР" : (pm?.passing_score ?? 0),
      (ivt?.places_filled ?? 0) < (ivt?.places_total ?? 0) ? "НЕДОБОР" : (ivt?.passing_score ?? 0),
      (itss?.places_filled ?? 0) < (itss?.places_total ?? 0) ? "НЕДОБОР" : (itss?.passing_score ?? 0),
      (ib?.places_filled ?? 0) < (ib?.places_total ?? 0) ? "НЕДОБОР" : (ib?.passing_score ?? 0),
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["", "ПМ", "ИВТ", "ИТСС", "ИБ"]],
    body: passingScoresBody,
    styles: {
      font: "Roboto",
      fontSize: 10,
      halign: 'center'
    },
    headStyles: {
      fillColor: [44, 62, 80],
      font: "Roboto"
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 80, fontStyle: 'bold' as const }
    }
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 15;

  // 6. Пересечения
  if (intersections) {
    if (currentY + 60 > 280) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(14);
    doc.text("Пересечения (выбор нескольких программ)", 14, currentY);
    currentY += 5;

    const interBody = [
      ["ПМ + ИВТ", intersections.pm_ivt, "ПМ + ИВТ + ИТСС", intersections.pm_ivt_itss],
      ["ПМ + ИТСС", intersections.pm_itss, "ПМ + ИВТ + ИБ", intersections.pm_ivt_ib],
      ["ПМ + ИБ", intersections.pm_ib, "ПМ + ИТСС + ИБ", intersections.pm_itss_ib],
      ["ИВТ + ИТСС", intersections.ivt_itss, "ИВТ + ИТСС + ИБ", intersections.ivt_itss_ib],
      ["ИВТ + ИБ", intersections.ivt_ib, "Все 4 направления", intersections.all_four],
      ["ИТСС + ИБ", intersections.itss_ib, "", ""],
    ];

    autoTable(doc, {
      startY: currentY,
      head: [["Пара программ", "Кол-во", "3+ программы", "Кол-во"]],
      body: interBody,
      styles: {
        font: "Roboto",
        fontSize: 10,
        halign: 'center'
      },
      headStyles: {
        fillColor: [44, 62, 80],
        font: "Roboto"
      },
      columnStyles: {
        0: { halign: 'left' },
        2: { halign: 'left' }
      }
    });

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 15;
  }

  // 7. Списки зачисленных
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
        font: "Roboto",
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