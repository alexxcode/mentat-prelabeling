@echo off
setlocal enabledelayedexpansion

set VM_NAME=mentat-489120
set MACHINE=n1-standard-4
set IMAGE_FAMILY=pytorch-2-7-cu128-ubuntu-2204-nvidia-570
set IMAGE_PROJECT=deeplearning-platform-release
set DISK_SIZE=100GB

echo ================================================
echo  EXPAI - Buscando zona disponible para T4 GPU
echo ================================================
echo.

:: Lista de zonas con T4 disponibles, ordenadas por latencia para LATAM
set ZONES=us-central1-c us-central1-f us-east1-c us-east1-b us-east1-d us-east4-c us-east4-b us-east4-a us-west1-b us-west1-a europe-west1-b europe-west1-c europe-west1-d europe-west4-a southamerica-east1-b southamerica-east1-a asia-east1-a asia-east1-c

for %%Z in (%ZONES%) do (
    echo [..] Intentando zona: %%Z
    gcloud compute instances create %VM_NAME% ^
        --zone=%%Z ^
        --machine-type=%MACHINE% ^
        --accelerator=type=nvidia-tesla-t4,count=1 ^
        --image-family=%IMAGE_FAMILY% ^
        --image-project=%IMAGE_PROJECT% ^
        --boot-disk-size=%DISK_SIZE% ^
        --boot-disk-type=pd-ssd ^
        --maintenance-policy=TERMINATE ^
        --metadata=install-nvidia-driver=True ^
        --quiet 2>nul

    if !errorlevel! == 0 (
        echo.
        echo [OK] VM creada en zona: %%Z
        echo.
        echo Configura SSH con:
        echo   gcloud compute config-ssh
        echo.
        echo Conecta con:
        echo   gcloud compute ssh %VM_NAME% --zone=%%Z
        echo.
        echo Guarda esta zona: %%Z
        goto :done
    ) else (
        echo [--] Zona %%Z sin recursos. Probando siguiente...
    )
)

echo.
echo [ERROR] No se encontro zona disponible en ninguna region.
echo Espera unos minutos y vuelve a ejecutar este script.
goto :end

:done
echo ================================================
echo  VM lista. Zona guardada arriba.
echo ================================================

:end
endlocal
pause
