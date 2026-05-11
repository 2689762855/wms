package com.wms.inventory.plugins;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        try {
            String packageName = getContext().getPackageName();
            android.content.pm.PackageInfo pInfo = getContext()
                    .getPackageManager()
                    .getPackageInfo(packageName, 0);
            JSObject ret = new JSObject();
            ret.put("versionCode", pInfo.versionCode);
            ret.put("versionName", pInfo.versionName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("无法获取版本信息: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }

        new Thread(() -> {
            File apkFile = null;
            try {
                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                conn.setRequestMethod("GET");
                conn.connect();

                if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    throw new Exception("下载失败，服务器返回 " + conn.getResponseCode());
                }

                apkFile = new File(getContext().getCacheDir(), "app-update.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(apkFile)) {
                    byte[] buf = new byte[8192];
                    int len;
                    int total = 0;
                    while ((len = in.read(buf)) > 0) {
                        out.write(buf, 0, len);
                        total += len;
                    }
                } finally {
                    conn.disconnect();
                }

                if (!apkFile.exists() || apkFile.length() == 0) {
                    throw new Exception("下载文件为空");
                }

                Uri apkUri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        apkFile);

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                new Handler(Looper.getMainLooper()).post(() -> call.resolve(ret));
            } catch (Exception e) {
                if (apkFile != null && apkFile.exists()) {
                    apkFile.delete();
                }
                String msg = "下载失败: " + e.getMessage();
                new Handler(Looper.getMainLooper()).post(() -> call.reject(msg));
            }
        }).start();
    }
}
