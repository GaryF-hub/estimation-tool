import * as XLSX from "xlsx";
import { EstimationSession } from "./types";

export function exportToExcel(session: EstimationSession) {
  const wb = XLSX.utils.book_new();

  const voterCount = session.voters.length;

  // Column layout: A (category), one col per voter, spacer, MIN, MAX, AVG
  const minColIdx = voterCount + 2;
  const maxColIdx = voterCount + 3;
  const avgColIdx = voterCount + 4;

  const firstVoterCol = "B";
  const lastVoterCol = XLSX.utils.encode_col(voterCount);
  const minColLetter = XLSX.utils.encode_col(minColIdx);
  const maxColLetter = XLSX.utils.encode_col(maxColIdx);
  const avgColLetter = XLSX.utils.encode_col(avgColIdx);

  // Row 1: Ticket URL/name + voter names + stat headers
  const headerRow: (string | null)[] = [
    session.ticketLink || session.ticketName || "",
  ];
  for (let i = 0; i < voterCount; i++) {
    headerRow.push(session.voters[i].name);
  }
  headerRow.push(null, "MIN", "MAX", "AVG");

  // Row 2: Empty gap
  const emptyRow: null[] = [];

  // Build all rows
  const allRows: (string | number | boolean | null)[][] = [
    headerRow as (string | number | boolean | null)[],
    emptyRow,
  ];

  // Category rows (row 3+ in Excel)
  session.rows.forEach((row) => {
    const rowData: (string | number | boolean | null)[] = [row.category];
    for (let i = 0; i < voterCount; i++) {
      rowData.push(row.votes[session.voters[i].id] ?? null);
    }
    rowData.push(null, null, null, null);
    allRows.push(rowData);
  });

  // Total row
  const totalRowData: (string | number | boolean | null)[] = [
    "Estimated days total",
  ];
  for (let i = 0; i < voterCount; i++) totalRowData.push(null);
  totalRowData.push(null, null, null, null);
  allRows.push(totalRowData);

  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Formulas — data starts at row 3 (after header + empty row)
  const firstCategoryRow = 3;
  const lastCategoryRow = 2 + session.rows.length;

  for (
    let excelRow = firstCategoryRow;
    excelRow <= lastCategoryRow;
    excelRow++
  ) {
    const range = `${firstVoterCol}${excelRow}:${lastVoterCol}${excelRow}`;
    ws[`${minColLetter}${excelRow}`] = {
      t: "n",
      f: `IF(COUNT(${range})>0,MIN(${range}),"")`,
    };
    ws[`${maxColLetter}${excelRow}`] = {
      t: "n",
      f: `IF(COUNT(${range})>0,MAX(${range}),"")`,
    };
    ws[`${avgColLetter}${excelRow}`] = {
      t: "n",
      f: `IF(COUNT(${range})>0,AVERAGE(${range}),"")`,
    };
  }

  // Total row: SUM of AVG column
  const totalExcelRow = lastCategoryRow + 1;
  const avgRange = `${avgColLetter}${firstCategoryRow}:${avgColLetter}${lastCategoryRow}`;
  ws[`${avgColLetter}${totalExcelRow}`] = { t: "n", f: `SUM(${avgRange})` };

  // Number format for MIN/MAX/AVG columns
  for (let excelRow = firstCategoryRow; excelRow <= totalExcelRow; excelRow++) {
    for (const col of [minColLetter, maxColLetter, avgColLetter]) {
      const ref = `${col}${excelRow}`;
      if (ws[ref]) {
        ws[ref].z = "0.0";
      }
    }
  }

  // Column widths
  const cols: XLSX.ColInfo[] = [{ wch: 55 }]; // A: category
  for (let i = 0; i < voterCount; i++) cols.push({ wch: 10 });
  cols.push({ wch: 3 }); // spacer
  cols.push({ wch: 8 }); // MIN
  cols.push({ wch: 8 }); // MAX
  cols.push({ wch: 8 }); // AVG
  ws["!cols"] = cols;

  XLSX.utils.book_append_sheet(wb, ws, "Estimation Scores");

  // Filename from ticket name
  const ticketName = session.ticketName?.trim();
  const filename = ticketName
    ? `${ticketName.replace(/[^a-zA-Z0-9-_ ]/g, "")}.xlsx`
    : "estimation.xlsx";

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
