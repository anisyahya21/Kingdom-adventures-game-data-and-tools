using System.Diagnostics;
using System.Net.Sockets;

const int BackendPort = 3001;
const int FrontendPort = 5173;
const string DefaultRoute = "/equipment";

var route = args.Length > 0 && args[0].StartsWith("/") ? args[0] : DefaultRoute;
var root = FindRepoRoot();
var backendDir = Path.Combine(root, "artifacts", "api-server");
var frontendDir = Path.Combine(root, "artifacts", "kingdom-adventures");

Console.Title = "KA Image Pipeline Launcher";
Console.WriteLine("Starting Kingdom Adventures image pipeline...");
Console.WriteLine($"Repo: {root}");

if (!Directory.Exists(backendDir) || !Directory.Exists(frontendDir))
{
    Console.Error.WriteLine("Could not find artifacts/api-server and artifacts/kingdom-adventures.");
    Console.Error.WriteLine("Put this launcher inside the KA-Website repo, then run it again.");
    PauseBeforeExit(1);
    return;
}

if (!await IsPortOpen(BackendPort))
{
    StartPowerShellWindow(
        "KA API Backend",
        backendDir,
        "$env:PORT='3001'; pnpm run dev"
    );
}
else
{
    Console.WriteLine($"Backend already appears to be running on port {BackendPort}.");
}

if (!await IsPortOpen(FrontendPort))
{
    StartPowerShellWindow(
        "KA Frontend",
        frontendDir,
        "$env:PORT='5173'; $env:BASE_PATH='/'; $env:API_PORT='3001'; pnpm run dev -- --host"
    );
}
else
{
    Console.WriteLine($"Frontend already appears to be running on port {FrontendPort}.");
}

var targetUrl = $"http://localhost:{FrontendPort}{route}";
Console.WriteLine($"Waiting for frontend, then opening {targetUrl}");

if (await WaitForPort(FrontendPort, TimeSpan.FromSeconds(45)))
{
    Process.Start(new ProcessStartInfo(targetUrl) { UseShellExecute = true });
    Console.WriteLine("Opened browser. You can close this launcher window.");
    return;
}

Console.Error.WriteLine("The frontend did not become ready in time.");
Console.Error.WriteLine($"Try opening {targetUrl} after the frontend window finishes loading.");
PauseBeforeExit(1);

static string FindRepoRoot()
{
    var candidates = new[]
    {
        AppContext.BaseDirectory,
        Environment.CurrentDirectory,
    };

    foreach (var candidate in candidates)
    {
        var directory = new DirectoryInfo(candidate);
        while (directory != null)
        {
            var apiServer = Path.Combine(directory.FullName, "artifacts", "api-server");
            var website = Path.Combine(directory.FullName, "artifacts", "kingdom-adventures");
            if (Directory.Exists(apiServer) && Directory.Exists(website))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }
    }

    return Environment.CurrentDirectory;
}

static void StartPowerShellWindow(string title, string workingDirectory, string command)
{
    var escapedTitle = title.Replace("'", "''");
    var fullCommand = $"$host.UI.RawUI.WindowTitle='{escapedTitle}'; {command}";
    var startInfo = new ProcessStartInfo
    {
        FileName = "powershell.exe",
        Arguments = $"-NoExit -ExecutionPolicy Bypass -Command \"{fullCommand}\"",
        WorkingDirectory = workingDirectory,
        UseShellExecute = true,
    };

    Process.Start(startInfo);
    Console.WriteLine($"Started {title}.");
}

static async Task<bool> WaitForPort(int port, TimeSpan timeout)
{
    var deadline = DateTime.UtcNow + timeout;
    while (DateTime.UtcNow < deadline)
    {
        if (await IsPortOpen(port))
        {
            return true;
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
        var timeout = Task.Delay(250);
        var completed = await Task.WhenAny(connect, timeout);
        return completed == connect && client.Connected;
    }
    catch
    {
        return false;
    }
}

static void PauseBeforeExit(int exitCode)
{
    Console.WriteLine("Press Enter to close.");
    Console.ReadLine();
    Environment.ExitCode = exitCode;
}
