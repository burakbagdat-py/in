#!/bin/sh
# Story Zoom güncelleyici (Mac / Linux)
# Bu klasörü GitHub'daki en son sürüme getirir. Eklenti 1 dakika içinde kendini yeniler.
cd "$(dirname "$0")" || exit 1
git pull --ff-only && echo "Güncellendi. Eklenti 1 dakika içinde kendini yenileyecek; sonra Instagram sekmesini yenileyin."
