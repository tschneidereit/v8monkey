/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is Google Inc.
 * Portions created by the Initial Developer are Copyright (C) 2005
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Darin Fisher <darin@meer.net>
 *  Masayuki Nakano <masayuki@d-toybox.com>
 *  Robert Strong <robert.bugzilla@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

#include <stdio.h>
#include <windows.h>
#include <commctrl.h>
#include <process.h>
#include <io.h>

#include "resource.h"
#include "progressui.h"
#include "readstrings.h"
#include "errors.h"

#define TIMER_ID 1
#define TIMER_INTERVAL 100

#define RESIZE_WINDOW(hwnd, extrax, extray) \
  { \
    RECT windowSize; \
    GetWindowRect(hwnd, &windowSize); \
    SetWindowPos(hwnd, 0, 0, 0, windowSize.right - windowSize.left + extrax, \
                 windowSize.bottom - windowSize.top + extray, \
                 SWP_NOMOVE | SWP_NOZORDER); \
  }

#define MOVE_WINDOW(hwnd, dx, dy) \
  { \
    RECT rc; \
    POINT pt; \
    GetWindowRect(hwnd, &rc); \
    pt.x = rc.left; \
    pt.y = rc.top; \
    ScreenToClient(GetParent(hwnd), &pt); \
    SetWindowPos(hwnd, 0, pt.x + dx, pt.y + dy, 0, 0, \
                 SWP_NOSIZE | SWP_NOZORDER); \
  }

static float sProgress;  // between 0 and 100
static BOOL  sQuit = FALSE;
static BOOL sIndeterminate = FALSE;
static StringTable sUIStrings;

static BOOL
GetStringsFile(WCHAR filename[MAX_PATH])
{
  if (!GetModuleFileNameW(NULL, filename, MAX_PATH))
    return FALSE;
 
  WCHAR *dot = wcsrchr(filename, '.');
  if (!dot || wcsicmp(dot + 1, L"exe"))
    return FALSE;

  wcscpy(dot + 1, L"ini");
  return TRUE;
}

static void
UpdateDialog(HWND hDlg)
{
  int pos = int(sProgress + 0.5f);
  HWND hWndPro = GetDlgItem(hDlg, IDC_PROGRESS);
  SendMessage(hWndPro, PBM_SETPOS, pos, 0L);
}

// The code in this function is from MSDN:
// http://msdn.microsoft.com/library/default.asp?url=/library/en-us/winui/winui/windowsuserinterface/windowing/dialogboxes/usingdialogboxes.asp
static void
CenterDialog(HWND hDlg)
{
  RECT rc, rcOwner, rcDlg;

  // Get the owner window and dialog box rectangles. 
  HWND desktop = GetDesktopWindow();

  GetWindowRect(desktop, &rcOwner); 
  GetWindowRect(hDlg, &rcDlg); 
  CopyRect(&rc, &rcOwner); 

  // Offset the owner and dialog box rectangles so that 
  // right and bottom values represent the width and 
  // height, and then offset the owner again to discard 
  // space taken up by the dialog box. 

  OffsetRect(&rcDlg, -rcDlg.left, -rcDlg.top); 
  OffsetRect(&rc, -rc.left, -rc.top); 
  OffsetRect(&rc, -rcDlg.right, -rcDlg.bottom); 

  // The new position is the sum of half the remaining 
  // space and the owner's original position. 

  SetWindowPos(hDlg, 
               HWND_TOP, 
               rcOwner.left + (rc.right / 2), 
               rcOwner.top + (rc.bottom / 2), 
               0, 0,          // ignores size arguments 
               SWP_NOSIZE); 
}

static void
InitDialog(HWND hDlg)
{
  WCHAR szwTitle[MAX_TEXT_LEN];
  WCHAR szwInfo[MAX_TEXT_LEN];

  MultiByteToWideChar(CP_UTF8, 0, sUIStrings.title, -1, szwTitle,
                      sizeof(szwTitle)/sizeof(szwTitle[0]));
  MultiByteToWideChar(CP_UTF8, 0, sUIStrings.info, -1, szwInfo,
                      sizeof(szwInfo)/sizeof(szwInfo[0]));

  SetWindowTextW(hDlg, szwTitle);
  SetWindowTextW(GetDlgItem(hDlg, IDC_INFO), szwInfo);

  // Set dialog icon
  HICON hIcon = LoadIcon(GetModuleHandle(NULL), MAKEINTRESOURCE(IDI_DIALOG));
  if (hIcon)
    SendMessage(hDlg, WM_SETICON, ICON_BIG, (LPARAM) hIcon);

  HWND hWndPro = GetDlgItem(hDlg, IDC_PROGRESS);
  SendMessage(hWndPro, PBM_SETRANGE, 0, MAKELPARAM(0, 100));
  if (sIndeterminate) {
    LONG_PTR val = GetWindowLongPtr(hWndPro, GWL_STYLE);
    SetWindowLongPtr(hWndPro, GWL_STYLE, val|PBS_MARQUEE); 
    SendMessage(hWndPro,(UINT) PBM_SETMARQUEE,(WPARAM) TRUE,(LPARAM)50 );
  }

  // Resize the dialog to fit all of the text if necessary.
  RECT infoSize, textSize;
  HWND hWndInfo = GetDlgItem(hDlg, IDC_INFO);

  // Get the control's font for calculating the new size for the control
  HDC hDCInfo = GetDC(hWndInfo);
  HFONT hInfoFont, hOldFont;
  hInfoFont = (HFONT)SendMessage(hWndInfo, WM_GETFONT, 0, 0);

  if (hInfoFont)
    hOldFont = (HFONT)SelectObject(hDCInfo, hInfoFont);

  // Measure the space needed for the text on a single line. DT_CALCRECT means
  // nothing is drawn.
  if (DrawText(hDCInfo, szwInfo, -1, &textSize,
               DT_CALCRECT | DT_NOCLIP | DT_SINGLELINE)) {
    GetClientRect(hWndInfo, &infoSize);
    SIZE extra;
    // Calculate the additional space needed for the text by subtracting from
    // the rectangle returned by DrawText the existing client rectangle's width
    // and height.
    extra.cx = (textSize.right - textSize.left) - \
               (infoSize.right - infoSize.left);
    extra.cy = (textSize.bottom - textSize.top) - \
               (infoSize.bottom - infoSize.top);
    if (extra.cx < 0)
      extra.cx = 0;
    if (extra.cy < 0)
      extra.cy = 0;
    if ((extra.cx > 0) || (extra.cy > 0)) {
      RESIZE_WINDOW(hDlg, extra.cx, extra.cy);
      RESIZE_WINDOW(hWndInfo, extra.cx, extra.cy);
      RESIZE_WINDOW(hWndPro, extra.cx, 0);
      MOVE_WINDOW(hWndPro, 0, extra.cy);
    }
  }

  if (hOldFont)
    SelectObject(hDCInfo, hOldFont);

  ReleaseDC(hWndInfo, hDCInfo);

  CenterDialog(hDlg);  // make dialog appear in the center of the screen

  SetTimer(hDlg, TIMER_ID, TIMER_INTERVAL, NULL);
}

// Message handler for update dialog.
static LRESULT CALLBACK
DialogProc(HWND hDlg, UINT message, WPARAM wParam, LPARAM lParam)
{
  switch (message)
  {
  case WM_INITDIALOG:
    InitDialog(hDlg);
    return TRUE;

  case WM_TIMER:
    if (sQuit) {
      EndDialog(hDlg, 0);
    } else {
      UpdateDialog(hDlg);
    }
    return TRUE;

  case WM_COMMAND:
    return TRUE;
  }
  return FALSE;
}

int
InitProgressUI(int *argc, NS_tchar ***argv)
{
  return 0;
}

/**
 * Initializes the progress UI strings
 * 
 * @return 0 on success, -1 on error
*/
int
InitProgressUIStrings() {
  // If we do not have updater.ini, then we should not bother showing UI.
  WCHAR filename[MAX_PATH];
  if (!GetStringsFile(filename)) {
    return -1;
  }

  if (_waccess(filename, 04)) {
    return -1;
  }
  
  // If the updater.ini doesn't have the required strings, then we should not
  // bother showing UI.
  if (ReadStrings(filename, &sUIStrings) != OK) {
    return -1;
  }

  return 0;
}

int
ShowProgressUI(bool indeterminate, bool initUIStrings)
{
  sIndeterminate = indeterminate;
  if (!indeterminate) {
    // Only show the Progress UI if the process is taking a significant amount of
    // time where a significant amount of time is defined as .5 seconds after
    // ShowProgressUI is called sProgress is less than 70.
    Sleep(500);

    if (sQuit || sProgress > 70.0f)
      return 0;
  }

  if (initUIStrings && InitProgressUIStrings() == -1) {
    return -1;
  }

  INITCOMMONCONTROLSEX icc = {
    sizeof(INITCOMMONCONTROLSEX),
    ICC_PROGRESS_CLASS
  };
  InitCommonControlsEx(&icc);

  DialogBox(GetModuleHandle(NULL),
            MAKEINTRESOURCE(IDD_DIALOG), NULL,
            (DLGPROC) DialogProc);

  return 0;
}

void
QuitProgressUI()
{
  sQuit = TRUE;
}

void
UpdateProgressUI(float progress)
{
  sProgress = progress;  // 32-bit writes are atomic
}
