import ExcelJS from "exceljs";
import { EstimationSession } from "./types";

function colLetter(idx: number): string {
  let letter = "";
  while (idx > 0) {
    const mod = (idx - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    idx = Math.floor((idx - 1) / 26);
  }
  return letter;
}

export async function exportToExcel(session: EstimationSession) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Estimation Scores");

  const voterCount = session.voters.length;

  // Column indices (1-based)
  const categoryCol = 1;
  const firstVoterCol = 2;
  const lastVoterCol = 1 + voterCount;
  const spacerCol = lastVoterCol + 1;
  const minCol = spacerCol + 1;
  const maxCol = minCol + 1;
  const avgCol = maxCol + 1;

  const firstVoterLetter = colLetter(firstVoterCol);
  const lastVoterLetter = colLetter(lastVoterCol);
  const minLetter = colLetter(minCol);
  const maxLetter = colLetter(maxCol);
  const avgLetter = colLetter(avgCol);

  // Row 1: Header
  const headerRow = ws.getRow(1);
  headerRow.getCell(categoryCol).value =
    session.ticketLink || session.ticketName || "";
  for (let i = 0; i < voterCount; i++) {
    headerRow.getCell(firstVoterCol + i).value = session.voters[i].name;
  }
  headerRow.getCell(minCol).value = "MIN";
  headerRow.getCell(maxCol).value = "MAX";
  headerRow.getCell(avgCol).value = "AVG";

  // Row 2: Empty gap (left blank)

  // Row 3+: Category rows
  const firstDataRow = 3;
  session.rows.forEach((row, idx) => {
    const excelRow = firstDataRow + idx;
    const wsRow = ws.getRow(excelRow);
    wsRow.getCell(categoryCol).value = row.category;

    for (let i = 0; i < voterCount; i++) {
      const vote = row.votes[session.voters[i].id];
      if (vote != null) {
        wsRow.getCell(firstVoterCol + i).value = vote;
      }
    }

    const range = `${firstVoterLetter}${excelRow}:${lastVoterLetter}${excelRow}`;
    wsRow.getCell(minCol).value = {
      formula: `IF(COUNT(${range})>0,MIN(${range}),"")`,
    } as ExcelJS.CellFormulaValue;
    wsRow.getCell(maxCol).value = {
      formula: `IF(COUNT(${range})>0,MAX(${range}),"")`,
    } as ExcelJS.CellFormulaValue;
    wsRow.getCell(avgCol).value = {
      formula: `IF(COUNT(${range})>0,AVERAGE(${range}),"")`,
    } as ExcelJS.CellFormulaValue;
  });

  // Total row
  const lastDataRow = firstDataRow + session.rows.length - 1;
  const totalExcelRow = lastDataRow + 1;
  const totalWsRow = ws.getRow(totalExcelRow);
  totalWsRow.getCell(categoryCol).value = "Estimated days total";
  const avgRange = `${avgLetter}${firstDataRow}:${avgLetter}${lastDataRow}`;
  totalWsRow.getCell(avgCol).value = {
    formula: `SUMPRODUCT(ROUND(${avgRange},2))`,
  } as ExcelJS.CellFormulaValue;

  // Number formats for MIN/MAX/AVG columns
  for (let row = firstDataRow; row <= totalExcelRow; row++) {
    for (const col of [minCol, maxCol, avgCol]) {
      ws.getRow(row).getCell(col).numFmt = "0.00";
    }
  }

  // Column widths
  ws.getColumn(categoryCol).width = 55;
  for (let i = 0; i < voterCount; i++) {
    ws.getColumn(firstVoterCol + i).width = 10;
  }
  ws.getColumn(spacerCol).width = 3;
  ws.getColumn(minCol).width = 8;
  ws.getColumn(maxCol).width = 8;
  ws.getColumn(avgCol).width = 8;

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const ticketName = session.ticketName?.trim();
  const filename = ticketName
    ? `${ticketName.replace(/[^a-zA-Z0-9-_ ]/g, "")}.xlsx`
    : "estimation.xlsx";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
