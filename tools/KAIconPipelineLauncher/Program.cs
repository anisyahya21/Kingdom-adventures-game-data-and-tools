using System.Diagnostics;
using System.Net;
using System.Net.Sockets;

const int Port = 5058;
const string LocalUrl = "http://127.0.0.1:5058";

Console.Title = "KA Icon Pipeline Launcher";

var root = FindRepoRoot();
var toolDir = Path.Combine(root, "tools", "icon_pipeline");
var appPath = Path.Combine(toolDir, "app.py");

Console.WriteLine("Starting KA icon pipeline...");
Console.WriteLine($"Repo: {root}");

if (!File.Exists(appPath))
{
    Console.Error.WriteLine("Could not find tools\\icon_pipeline\\app.py.");
    Console.Error.WriteLine("Put this launcher inside the KA-Website repo, then run it again.");
    PauseBeforeExit(1);
    return;
}

if (!await IsPortOpen(Port))
{
    StartPowerShellWindow(toolDir);
}
else
{
    Console.WriteLine($"Icon pipeline already appears to be running on port {Port}.");
}

Console.WriteLine($"Waiting for {LocalUrl}...");
if (await WaitForHttp(LocalUrl, TimeSpan.FromSeconds(30)))
{
    var lanIp = GetLanIpAddress();
    Console.WriteLine($"Opening {LocalUrl}");
    if (!string.IsNullOrWhiteSpace(lanIp))
    {
        Console.WriteLine($"Phone/iPad URL on same Wi-Fi: http://{lanIp}:{Port}");
    }

    Process.Start(new ProcessStartInfo(LocalUrl) { UseShellExecute = true });
    return;
}

Console.Error.WriteLine("The icon pipeline did not become ready in time.");
Console.Error.WriteLine($"Try opening {LocalUrl} after the server window finishes loading.");
PauseBeforeExit(1);

static string FindRepoRoot()
{
    foreach (var candidate in new[] { AppContext.BaseDirectory, Environment.CurrentDirectory })
    {
        var directory = new DirectoryInfo(candidate);
        while (directory != null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "tools", "icon_pipeline", "app.py")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }
    }

    return Environment.CurrentDirectory;
}

static void StartPowerShellWindow(string workingDirectory)
{
    var command =
        "$host.UI.RawUI.WindowTitle='KA Icon Pipeline'; " +
        "$env:ICON_PIPELINE_HOST='0.0.0.0'; " +
        "$env:ICON_PIPELINE_PORT='5058'; " +
        "python app.py";

    var startInfo = new ProcessStartInfo
    {
        FileName = "powershell.exe",
        Arguments = $"-NoExit -ExecutionPolicy Bypass -Command \"{command}\"",
        WorkingDirectory = workingDirectory,
        UseShellExecute = true,
    };

    Process.Start(startInfo);
    Console.WriteLine("Started icon pipeline server window.");
}

static async Task<bool> WaitForHttp(string url, TimeSpan timeout)
{
    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
    var deadline = DateTime.UtcNow + timeout;
    while (DateTime.UtcNow < deadline)
    {
        try
        {
            using var response = await client.GetAsync(url);
            if ((int)response.StatusCode < 500)
            {
                return true;
            }
        }
        catch
        {
            // Server is still starting.
        }

        await Task.Delay(750);
    }

    return false;
}

static async Task<bool> IsPortOpen(int port)
{
    try
    {
        using var client = new TcpClient();
        var connect = client.ConnectAsync("127.0.0.1", port);
        var completed = await Task.WhenAny(connect, Task.Delay(250));
        return completed == connect && client.Connected;
    }
    catch
    {
        return false;
    }
}

static string? GetLanIpAddress()
{
    try
    {
        return Dns.GetHostEntry(Dns.GetHostName())
            .AddressList
            .Where(address => address.AddressFamily == AddressFamily.InterNetwork)
            .Select(address => address.ToString())
            .FirstOrDefault(address => !address.StartsWith("127."));
    }
    catch
    {
        return null;
    }
}

static void PauseBeforeExit(int exitCode)
{
    Console.WriteLine("Press Enter to close.");
    Console.ReadLine();
    Environment.ExitCode = exitCode;
}
