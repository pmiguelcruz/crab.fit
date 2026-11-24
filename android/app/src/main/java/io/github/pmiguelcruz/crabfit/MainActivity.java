package io.github.pmiguelcruz.crabfit;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

import java.util.Map;

public final class MainActivity extends Activity {
    private SharedPreferences settings;
    private SharedPreferences polls;
    private Button website;
    private LinearLayout pollList;
    private View empty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        if (Build.VERSION.SDK_INT >= 30) {
            View screen = findViewById(R.id.screen);
            screen.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
            screen.requestApplyInsets();
        }

        settings = getSharedPreferences("settings", MODE_PRIVATE);
        polls = getSharedPreferences("polls", MODE_PRIVATE);
        website = findViewById(R.id.website);
        pollList = findViewById(R.id.polls);
        empty = findViewById(R.id.empty);

        website.setOnClickListener(view -> editWebsite());
        findViewById(R.id.create).setOnClickListener(view -> open(origin() + "/create"));
        findViewById(R.id.save).setOnClickListener(view -> savePoll(null));
        updateWebsite();
        renderPolls();
        if (savedInstanceState == null) receiveLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receiveLink(intent);
    }

    private void receiveLink(Intent intent) {
        if (!Intent.ACTION_SEND.equals(intent.getAction()) || !"text/plain".equals(intent.getType())) return;

        String url = PollLinks.sharedPoll(intent.getCharSequenceExtra(Intent.EXTRA_TEXT), origin());
        if (url == null) {
            Toast.makeText(this, getString(R.string.poll_link_error, PollLinks.host(origin())), Toast.LENGTH_LONG).show();
            return;
        }
        savePoll(url);
    }

    private String origin() {
        return settings.getString("origin", PollLinks.DEFAULT_ORIGIN);
    }

    private void updateWebsite() {
        website.setText(origin());
        website.setContentDescription(getString(R.string.instance_settings) + ", " + origin());
    }

    private void editWebsite() {
        View fields = getLayoutInflater().inflate(R.layout.save_poll, null);
        fields.findViewById(R.id.poll_title).setVisibility(View.GONE);
        EditText url = fields.findViewById(R.id.poll_link);
        url.setHint(R.string.instance_hint);
        url.setText(origin());

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle(R.string.instance_settings)
            .setMessage(R.string.instance_help)
            .setView(fields)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(android.R.string.ok, null)
            .show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String updated = PollLinks.origin(url.getText().toString());
            if (updated == null) {
                url.setError(getString(R.string.instance_error));
                return;
            }
            settings.edit().putString("origin", updated).apply();
            updateWebsite();
            dialog.dismiss();
        });
    }

    private void savePoll(String sharedUrl) {
        String currentOrigin = origin();
        View fields = getLayoutInflater().inflate(R.layout.save_poll, null);
        EditText url = fields.findViewById(R.id.poll_link);
        EditText title = fields.findViewById(R.id.poll_title);
        if (sharedUrl != null) {
            url.setText(sharedUrl);
            title.setText(polls.getString(sharedUrl, ""));
            title.requestFocus();
        }

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle(R.string.save_poll)
            .setView(fields)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(android.R.string.ok, null)
            .show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String link = PollLinks.poll(url.getText().toString(), currentOrigin);
            if (link == null) {
                url.setError(getString(R.string.poll_link_error, PollLinks.host(currentOrigin)));
                return;
            }
            String name = title.getText().toString().trim();
            if (name.isEmpty()) name = Uri.parse(link).getLastPathSegment();
            polls.edit().putString(link, name).apply();
            renderPolls();
            dialog.dismiss();
        });
    }

    private void renderPolls() {
        pollList.removeAllViews();
        Map<String, ?> saved = polls.getAll();
        empty.setVisibility(saved.isEmpty() ? View.VISIBLE : View.GONE);
        saved.entrySet().stream()
            .sorted((left, right) -> left.getValue().toString().compareToIgnoreCase(right.getValue().toString()))
            .forEach(entry -> addPollRow(entry.getKey(), entry.getValue().toString()));
    }

    private void addPollRow(String url, String title) {
        View row = getLayoutInflater().inflate(R.layout.poll_row, pollList, false);
        Button open = row.findViewById(R.id.open_poll);
        open.setText(title);
        open.setOnClickListener(view -> open(url));

        Button share = row.findViewById(R.id.share_poll);
        share.setContentDescription(getString(R.string.share_poll, title));
        share.setOnClickListener(view -> {
            Intent outgoing = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, url);
            startActivity(Intent.createChooser(outgoing, getString(R.string.share_link)));
        });

        Button remove = row.findViewById(R.id.remove_poll);
        remove.setContentDescription(getString(R.string.remove_poll, title));
        remove.setOnClickListener(view -> {
            polls.edit().remove(url).apply();
            renderPolls();
        });
        pollList.addView(row);
    }

    private void open(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.browser_missing, Toast.LENGTH_LONG).show();
        }
    }
}
